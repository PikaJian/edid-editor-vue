//! Reads raw EDID blobs from the displays currently attached to the machine.
//!
//! Every platform exposes EDID somewhere different, so each has its own
//! implementation below. All of them return the bytes exactly as the OS
//! reports them — parsing is left to the frontend, which already has a full
//! EDID decoder.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct DisplayEdid {
  /// Stable-ish identifier for this display within one enumeration.
  pub id: String,
  /// Connector or port the display is attached to, when the OS reports one.
  pub connector: Option<String>,
  pub bytes: Vec<u8>,
}

/// Every EDID starts with this fixed 8-byte pattern. Used to reject
/// non-EDID blobs that happen to live under the same property name.
const EDID_MAGIC: [u8; 8] = [0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x00];

fn looks_like_edid(bytes: &[u8]) -> bool {
  bytes.len() >= 128 && bytes[..8] == EDID_MAGIC
}

/// Drops blobs that aren't EDIDs and collapses duplicates, which occur when
/// the same panel is reachable through more than one registry/sysfs path.
fn dedupe(found: Vec<(Option<String>, Vec<u8>)>) -> Vec<DisplayEdid> {
  let mut out: Vec<DisplayEdid> = Vec::new();
  for (connector, bytes) in found {
    if !looks_like_edid(&bytes) {
      continue;
    }
    if out.iter().any(|d| d.bytes == bytes) {
      continue;
    }
    out.push(DisplayEdid {
      id: format!("display-{}", out.len()),
      connector,
      bytes,
    });
  }
  out
}

/// Registry path holding a device's EDID, from the instance ID SetupAPI reports
/// (`DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353`). Windows-only in use, but kept out of
/// the `#[cfg]`'d module so its behaviour is testable on any host.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn device_parameters_path(instance_id: &str) -> String {
  format!(r"SYSTEM\CurrentControlSet\Enum\{instance_id}\Device Parameters")
}

/// The PnP hardware ID out of an instance ID — `GSM5B09` above. Not a connector
/// in the sense the other platforms report one; it identifies the panel's
/// vendor and model, which is the most useful label the Windows path has.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn connector_label(instance_id: &str) -> Option<String> {
  instance_id
    .split('\\')
    .nth(1)
    .filter(|part| !part.is_empty())
    .map(str::to_string)
}

#[cfg(target_os = "macos")]
mod platform {
  use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
  use core_foundation::data::{CFData, CFDataRef};
  use core_foundation::string::CFString;
  use io_kit_sys::keys::kIOServicePlane;
  use io_kit_sys::types::{io_iterator_t, io_registry_entry_t};
  use io_kit_sys::{
    kIORegistryIterateRecursively, IOObjectRelease, IOIteratorNext, IORegistryEntryCreateCFProperty,
    IORegistryEntryCreateIterator, IORegistryGetRootEntry,
  };
  use std::ffi::CStr;

  // Apple Silicon exposes the blob as "EDID" on IOPortTransportStateDisplayPort
  // nodes; Intel Macs use "IODisplayEDID" on IODisplayConnect. Rather than match
  // on a class name that shifts between macOS releases, walk the whole registry
  // and take whichever property is present.
  const EDID_KEYS: [&str; 2] = ["EDID", "IODisplayEDID"];

  unsafe fn cf_data_property(entry: io_registry_entry_t, key: &str) -> Option<Vec<u8>> {
    let cf_key = CFString::new(key);
    let raw: CFTypeRef =
      IORegistryEntryCreateCFProperty(entry, cf_key.as_concrete_TypeRef(), std::ptr::null(), 0);
    if raw.is_null() {
      return None;
    }
    // The property is only useful to us if it really is a CFData.
    let bytes = if core_foundation::base::CFGetTypeID(raw) == CFData::type_id() {
      Some(CFData::wrap_under_get_rule(raw as CFDataRef).to_vec())
    } else {
      None
    };
    CFRelease(raw);
    bytes
  }

  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    let mut found = Vec::new();
    unsafe {
      // Passing 0 as the port means kIOMainPortDefault on every supported macOS.
      let root = IORegistryGetRootEntry(0);
      if root == 0 {
        return Err("could not open the IORegistry root".into());
      }

      let mut iter: io_iterator_t = 0;
      let plane = CStr::from_ptr(kIOServicePlane as *const _);
      let status = IORegistryEntryCreateIterator(
        root,
        plane.as_ptr() as *const libc::c_char,
        kIORegistryIterateRecursively,
        &mut iter,
      );
      IOObjectRelease(root);
      if status != 0 {
        return Err(format!("IORegistryEntryCreateIterator failed: {status}"));
      }

      loop {
        let entry = IOIteratorNext(iter);
        if entry == 0 {
          break;
        }
        for key in EDID_KEYS {
          if let Some(bytes) = cf_data_property(entry, key) {
            found.push((Some("DisplayPort".to_string()), bytes));
            break;
          }
        }
        IOObjectRelease(entry);
      }
      IOObjectRelease(iter);
    }
    Ok(found)
  }
}

#[cfg(target_os = "linux")]
mod platform {
  use std::fs;

  /// DRM exposes each connector's EDID at /sys/class/drm/<connector>/edid.
  /// The file is empty when nothing is plugged into that connector.
  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    let mut found = Vec::new();
    let entries = fs::read_dir("/sys/class/drm")
      .map_err(|e| format!("could not list /sys/class/drm: {e}"))?;

    for entry in entries.flatten() {
      let path = entry.path().join("edid");
      if !path.exists() {
        continue;
      }
      let connector = entry.file_name().to_string_lossy().to_string();
      match fs::read(&path) {
        Ok(bytes) if !bytes.is_empty() => found.push((Some(connector), bytes)),
        _ => continue,
      }
    }
    Ok(found)
  }
}

#[cfg(target_os = "windows")]
mod platform {
  use super::{connector_label, device_parameters_path};
  use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW,
    SetupDiGetDeviceInstanceIdW, HDEVINFO, DIGCF_PRESENT, GUID_DEVCLASS_MONITOR, SP_DEVINFO_DATA,
  };
  use winreg::enums::HKEY_LOCAL_MACHINE;
  use winreg::RegKey;

  /// `SetupDiGetClassDevsW` reports failure as INVALID_HANDLE_VALUE. It cannot be
  /// compared against `Foundation::INVALID_HANDLE_VALUE` directly, because
  /// windows-sys types `HDEVINFO` as an `isize` rather than a `HANDLE`.
  const INVALID_HDEVINFO: HDEVINFO = -1;

  /// MAX_DEVICE_ID_LEN is 200 wide chars including the terminator; this leaves slack.
  const INSTANCE_ID_BUFFER: usize = 512;

  /// Instance IDs of the monitors Windows currently reports as **present**, e.g.
  /// `DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353`.
  ///
  /// `DIGCF_PRESENT` is the entire point of going through SetupAPI. The registry
  /// keeps a `SYSTEM\CurrentControlSet\Enum\DISPLAY\...` entry for every monitor
  /// ever attached to the machine, and unplugging one does not remove it, so
  /// walking that tree lists displays that have been gone for months. Nothing in
  /// the key itself reliably says "attached"; only the device manager's notion of
  /// presence does, which is what this asks for.
  fn present_monitor_instance_ids() -> Result<Vec<String>, String> {
    let mut ids = Vec::new();
    unsafe {
      let set = SetupDiGetClassDevsW(
        &GUID_DEVCLASS_MONITOR,
        std::ptr::null(),
        std::ptr::null_mut(),
        DIGCF_PRESENT,
      );
      if set == INVALID_HDEVINFO {
        return Err("SetupDiGetClassDevsW failed for the monitor device class".into());
      }

      let mut index = 0u32;
      loop {
        let mut info = SP_DEVINFO_DATA {
          cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
          ..Default::default()
        };
        // Returns FALSE once the index runs past the last device, which is the
        // only outcome we can act on — a genuine error looks the same here.
        if SetupDiEnumDeviceInfo(set, index, &mut info) == 0 {
          break;
        }
        index += 1;

        let mut buffer = [0u16; INSTANCE_ID_BUFFER];
        let mut required = 0u32;
        let ok = SetupDiGetDeviceInstanceIdW(
          set,
          &info,
          buffer.as_mut_ptr(),
          buffer.len() as u32,
          &mut required,
        );
        if ok == 0 {
          continue;
        }
        let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
        ids.push(String::from_utf16_lossy(&buffer[..end]));
      }

      SetupDiDestroyDeviceInfoList(set);
    }
    Ok(ids)
  }

  /// The EDID itself still comes from the registry — SetupAPI is used only to
  /// decide *which* devices to read.
  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let mut found = Vec::new();

    for instance_id in present_monitor_instance_ids()? {
      let Ok(params) = hklm.open_subkey(device_parameters_path(&instance_id)) else {
        continue;
      };
      let Ok(value) = params.get_raw_value("EDID") else {
        continue;
      };
      if !value.bytes.is_empty() {
        found.push((connector_label(&instance_id), value.bytes));
      }
    }
    Ok(found)
  }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
mod platform {
  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    Err("reading display EDID is not supported on this platform".into())
  }
}

#[tauri::command]
pub fn read_display_edids() -> Result<Vec<DisplayEdid>, String> {
  Ok(dedupe(platform::collect()?))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn valid_edid(tail: u8) -> Vec<u8> {
    let mut v = vec![0u8; 128];
    v[..8].copy_from_slice(&EDID_MAGIC);
    v[127] = tail;
    v
  }

  #[test]
  fn keeps_valid_edids_and_assigns_ids() {
    let out = dedupe(vec![
      (Some("DP-1".into()), valid_edid(1)),
      (Some("DP-2".into()), valid_edid(2)),
    ]);
    assert_eq!(out.len(), 2);
    assert_eq!(out[0].id, "display-0");
    assert_eq!(out[1].id, "display-1");
    assert_eq!(out[1].connector.as_deref(), Some("DP-2"));
  }

  #[test]
  fn rejects_blobs_without_the_edid_header() {
    assert!(dedupe(vec![(None, vec![0xAB; 128])]).is_empty());
  }

  #[test]
  fn rejects_blobs_that_are_too_short() {
    let mut short = EDID_MAGIC.to_vec();
    short.extend_from_slice(&[0u8; 8]);
    assert!(dedupe(vec![(None, short)]).is_empty());
  }

  /// Hits the real display hardware, so it only runs on request:
  /// `cargo test -- --ignored --nocapture`.
  #[test]
  #[ignore]
  fn dumps_attached_displays() {
    let displays = read_display_edids().expect("enumeration failed");
    println!("found {} display(s)", displays.len());
    for d in &displays {
      println!(
        "  {} connector={:?} {} bytes, header_ok={}",
        d.id,
        d.connector,
        d.bytes.len(),
        looks_like_edid(&d.bytes)
      );
      println!("    first16: {:02x?}", &d.bytes[..16]);
    }
    assert!(!displays.is_empty(), "expected at least one attached display");
  }

  /// The Windows instance ID is a registry path fragment, so it appends directly.
  #[test]
  fn builds_the_device_parameters_path_from_an_instance_id() {
    assert_eq!(
      device_parameters_path(r"DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353"),
      r"SYSTEM\CurrentControlSet\Enum\DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353\Device Parameters"
    );
  }

  #[test]
  fn takes_the_pnp_id_as_the_connector_label() {
    assert_eq!(
      connector_label(r"DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353").as_deref(),
      Some("GSM5B09")
    );
  }

  /// A malformed instance ID must not produce an empty or panicking label.
  #[test]
  fn has_no_connector_label_without_a_pnp_id() {
    assert_eq!(connector_label("DISPLAY"), None);
    assert_eq!(connector_label(r"DISPLAY\"), None);
    assert_eq!(connector_label(""), None);
  }

  #[test]
  fn collapses_the_same_panel_seen_twice() {
    let out = dedupe(vec![
      (Some("a".into()), valid_edid(7)),
      (Some("b".into()), valid_edid(7)),
    ]);
    assert_eq!(out.len(), 1);
  }
}
