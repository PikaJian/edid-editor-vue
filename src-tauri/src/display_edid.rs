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
  use winreg::enums::HKEY_LOCAL_MACHINE;
  use winreg::RegKey;

  /// Windows caches each monitor's EDID under
  /// SYSTEM\CurrentControlSet\Enum\DISPLAY\<PnPID>\<instance>\Device Parameters\EDID.
  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let display = hklm
      .open_subkey(r"SYSTEM\CurrentControlSet\Enum\DISPLAY")
      .map_err(|e| format!("could not open the DISPLAY registry key: {e}"))?;

    let mut found = Vec::new();
    for pnp_id in display.enum_keys().flatten() {
      let Ok(pnp_key) = display.open_subkey(&pnp_id) else {
        continue;
      };
      for instance in pnp_key.enum_keys().flatten() {
        let Ok(params) = pnp_key.open_subkey(format!(r"{instance}\Device Parameters")) else {
          continue;
        };
        let Ok(value) = params.get_raw_value("EDID") else {
          continue;
        };
        if !value.bytes.is_empty() {
          found.push((Some(pnp_id.clone()), value.bytes));
        }
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

  #[test]
  fn collapses_the_same_panel_seen_twice() {
    let out = dedupe(vec![
      (Some("a".into()), valid_edid(7)),
      (Some("b".into()), valid_edid(7)),
    ]);
    assert_eq!(out.len(), 1);
  }
}
