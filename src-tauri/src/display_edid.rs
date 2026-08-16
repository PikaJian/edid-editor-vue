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

/// Common key for the same monitor as SetupAPI and WMI each name it. Both are
/// the PnP device instance path, but WMI appends an output index
/// (`…\5&2a1bd7b&0&UID4353_0`), and neither promises a particular case.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn normalize_instance_name(name: &str) -> String {
  let trimmed = match name.rsplit_once('_') {
    Some((head, tail)) if !tail.is_empty() && tail.bytes().all(|b| b.is_ascii_digit()) => head,
    _ => name,
  };
  trimmed.to_ascii_uppercase()
}

/// Picks between the two Windows sources for one monitor's EDID.
///
/// `SYSTEM\CurrentControlSet\Enum\…\Device Parameters\EDID` is a cache the
/// monitor driver writes, and on plenty of machines it holds only the 128-byte
/// base block — the CTA-861 and DisplayID extensions the panel really reports
/// are simply not there. `WmiGetMonitorRawEEdidV1Block` enumerates every block,
/// so it is preferred whenever it produced at least as much as the registry.
///
/// Neither source is trusted blindly: whichever is longer wins, so a WMI read
/// that stopped early cannot lose bytes the registry already had.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn best_edid(wmi: Option<Vec<u8>>, registry: Option<Vec<u8>>) -> Option<Vec<u8>> {
  let wmi = wmi.filter(|b| looks_like_edid(b));
  let registry = registry.filter(|b| looks_like_edid(b));
  match (wmi, registry) {
    (Some(w), Some(r)) => Some(if r.len() > w.len() { r } else { w }),
    (Some(w), None) => Some(w),
    (None, registry) => registry,
  }
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

/// Reads the full E-EDID — base block plus every extension — out of WMI.
///
/// `root\WMI`'s `WmiMonitorDescriptorMethods.WmiGetMonitorRawEEdidV1Block`
/// hands back one 128-byte block at a time, straight from what the monitor
/// driver read over DDC. It is the only Windows API that exposes the extension
/// blocks; the registry copy the rest of this module falls back on frequently
/// stops after the base block.
#[cfg(target_os = "windows")]
mod wmi_edid {
  use super::normalize_instance_name;
  use std::collections::HashMap;
  use std::ffi::c_void;
  use windows::core::{w, BSTR, PCWSTR};
  use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoSetProxyBlanket, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL, RPC_C_IMP_LEVEL_IMPERSONATE, SAFEARRAY,
  };
  use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayGetLBound, SafeArrayGetUBound, SafeArrayUnaccessData,
  };
  use windows::Win32::System::Rpc::{RPC_C_AUTHN_WINNT, RPC_C_AUTHZ_NONE};
  use windows::Win32::System::Variant::{
    VariantClear, VARENUM, VARIANT, VT_ARRAY, VT_BSTR, VT_I4, VT_UI1, VT_UI4,
  };
  use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator, WBEM_FLAG_FORWARD_ONLY,
    WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_GENERIC_FLAG_TYPE, WBEM_INFINITE,
  };

  /// EDID 1.4 allows 254 extensions; displays ship one or two. This only has to
  /// stop a driver that answers every block id from looping forever.
  const MAX_EDID_BLOCKS: u8 = 8;

  /// Every block is exactly 128 bytes. A short one means the driver filled the
  /// out parameter with something else, so it is not appended.
  const EDID_BLOCK_LEN: usize = 128;

  unsafe fn variant_string(value: &VARIANT) -> Option<String> {
    let inner = &value.Anonymous.Anonymous;
    if inner.vt != VT_BSTR {
      return None;
    }
    Some(inner.Anonymous.bstrVal.to_string())
  }

  unsafe fn variant_u32(value: &VARIANT) -> Option<u32> {
    let inner = &value.Anonymous.Anonymous;
    match inner.vt {
      VT_UI1 => Some(inner.Anonymous.bVal as u32),
      VT_I4 => Some(inner.Anonymous.lVal as u32),
      VT_UI4 => Some(inner.Anonymous.ulVal),
      _ => None,
    }
  }

  unsafe fn variant_bytes(value: &VARIANT) -> Option<Vec<u8>> {
    let inner = &value.Anonymous.Anonymous;
    if inner.vt != VARENUM(VT_ARRAY.0 | VT_UI1.0) {
      return None;
    }
    let array: *mut SAFEARRAY = inner.Anonymous.parray;
    if array.is_null() {
      return None;
    }
    let lower = SafeArrayGetLBound(array, 1).ok()?;
    let upper = SafeArrayGetUBound(array, 1).ok()?;
    if upper < lower {
      return None;
    }
    let len = (upper - lower + 1) as usize;
    let mut data: *mut c_void = std::ptr::null_mut();
    SafeArrayAccessData(array, &mut data).ok()?;
    let bytes = std::slice::from_raw_parts(data as *const u8, len).to_vec();
    let _ = SafeArrayUnaccessData(array);
    Some(bytes)
  }

  /// `IWbemClassObject::Get` hands back a VARIANT the caller owns, so every read
  /// goes through here to pair it with the matching `VariantClear`.
  unsafe fn property<T>(
    object: &IWbemClassObject,
    name: PCWSTR,
    read: unsafe fn(&VARIANT) -> Option<T>,
  ) -> Option<T> {
    let mut value = VARIANT::default();
    if object.Get(name, 0, &mut value, None, None).is_err() {
      return None;
    }
    let out = read(&value);
    let _ = VariantClear(&mut value);
    out
  }

  /// Blocks 0, 1, 2 … concatenated, stopping at the first one the driver will
  /// not produce. Deliberately does not consult the base block's extension
  /// count at byte 126 — real EDIDs undercount it, which is the same reason
  /// `EDID.decode()` in the frontend ignores it.
  unsafe fn read_all_blocks(
    services: &IWbemServices,
    in_signature: &IWbemClassObject,
    instance_name: &str,
    path: &str,
  ) -> Vec<u8> {
    let path = BSTR::from(path);
    let method = BSTR::from("WmiGetMonitorRawEEdidV1Block");
    let mut edid: Vec<u8> = Vec::new();

    for block_id in 0..MAX_EDID_BLOCKS {
      let Ok(input) = in_signature.SpawnInstance(0) else {
        log::warn!("{instance_name}: could not spawn the method input instance");
        break;
      };
      let mut argument = VARIANT::default();
      {
        let inner = &mut argument.Anonymous.Anonymous;
        inner.vt = VT_UI1;
        inner.Anonymous.bVal = block_id;
      }
      if let Err(e) = input.Put(w!("BlockId"), 0, &argument, 0) {
        log::warn!("{instance_name}: could not set BlockId {block_id}: {e}");
        break;
      }

      // A block id past the last one the driver holds comes back as a failed
      // call, which is this loop's usual terminating condition.
      let mut output: Option<IWbemClassObject> = None;
      if let Err(e) = services.ExecMethod(
        &path,
        &method,
        WBEM_GENERIC_FLAG_TYPE(0),
        None,
        &input,
        Some(&mut output),
        None,
      ) {
        log::info!("{instance_name}: block {block_id} unavailable ({e})");
        break;
      }
      let Some(output) = output else {
        log::warn!("{instance_name}: block {block_id} returned no output object");
        break;
      };

      let status = property(&output, w!("ReturnValue"), variant_u32);
      let kind = property(&output, w!("BlockType"), variant_u32);
      let content = property(&output, w!("BlockContent"), variant_bytes);
      // Mirrors what the equivalent PowerShell prints, so a driver that behaves
      // unlike the one this was written against can be diagnosed from a log
      // rather than another build.
      log::info!(
        "{instance_name}: block {block_id} ReturnValue={status:?} BlockType={kind:?} len={:?}",
        content.as_ref().map(|c| c.len())
      );

      // `ReturnValue` is deliberately *not* a gate. The documentation says 0 on
      // success, but the `Invoke-CimMethod` loop that this was validated against
      // ignores it entirely and reads good blocks regardless, so treating a
      // non-zero value as fatal throws away data that is really there.
      let Some(content) = content else { break };
      // Some drivers hand back a buffer larger than one block; the first 128
      // bytes are the block either way. Anything shorter is not usable.
      if content.len() < EDID_BLOCK_LEN {
        break;
      }
      let block = &content[..EDID_BLOCK_LEN];

      // Two guards that replace the `ReturnValue` check, for a driver that
      // answers every block id rather than failing past the last one: an
      // all-zero buffer is an unfilled out parameter, and a repeat of a block
      // already read means the driver is echoing rather than enumerating.
      if block.iter().all(|&b| b == 0) {
        log::info!("{instance_name}: block {block_id} came back empty, stopping");
        break;
      }
      if edid.chunks_exact(EDID_BLOCK_LEN).any(|seen| seen == block) {
        log::info!("{instance_name}: block {block_id} repeats an earlier block, stopping");
        break;
      }
      edid.extend_from_slice(block);
    }

    edid
  }

  unsafe fn query_monitor_edids() -> Result<HashMap<String, Vec<u8>>, String> {
    let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)
      .map_err(|e| format!("could not create the WMI locator: {e}"))?;

    let services: IWbemServices = locator
      .ConnectServer(
        &BSTR::from(r"ROOT\WMI"),
        &BSTR::new(),
        &BSTR::new(),
        &BSTR::new(),
        0,
        &BSTR::new(),
        None,
      )
      .map_err(|e| format!(r"could not connect to ROOT\WMI: {e}"))?;

    // Only the proxy's security is set, not the process-wide default: this runs
    // inside a webview host that has its own opinion about COM security, and
    // `CoInitializeSecurity` can only be called once per process anyway.
    CoSetProxyBlanket(
      &services,
      RPC_C_AUTHN_WINNT,
      RPC_C_AUTHZ_NONE,
      None,
      RPC_C_AUTHN_LEVEL_CALL,
      RPC_C_IMP_LEVEL_IMPERSONATE,
      None,
      EOAC_NONE,
    )
    .map_err(|e| format!("CoSetProxyBlanket failed: {e}"))?;

    // The method lives on the class, so its input signature is fetched once and
    // a fresh instance spawned per call.
    let mut class: Option<IWbemClassObject> = None;
    services
      .GetObject(
        &BSTR::from("WmiMonitorDescriptorMethods"),
        WBEM_GENERIC_FLAG_TYPE(0),
        None,
        Some(&mut class),
        None,
      )
      .map_err(|e| format!("WmiMonitorDescriptorMethods is unavailable: {e}"))?;
    let class = class.ok_or("WMI returned no WmiMonitorDescriptorMethods class")?;

    let mut in_signature: Option<IWbemClassObject> = None;
    let mut out_signature: Option<IWbemClassObject> = None;
    class
      .GetMethod(
        w!("WmiGetMonitorRawEEdidV1Block"),
        0,
        &mut in_signature,
        &mut out_signature,
      )
      .map_err(|e| format!("WmiGetMonitorRawEEdidV1Block is unavailable: {e}"))?;
    let in_signature = in_signature.ok_or("WMI returned no input signature for the EDID method")?;

    // `SELECT *`, not a property list: a property-restricted query returns
    // partial instances, and the system properties this needs to address an
    // instance are not guaranteed to survive that.
    let enumerator = services
      .ExecQuery(
        &BSTR::from("WQL"),
        &BSTR::from("SELECT * FROM WmiMonitorDescriptorMethods"),
        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
        None,
      )
      .map_err(|e| format!("querying WmiMonitorDescriptorMethods failed: {e}"))?;

    // Drained in full before a single method is invoked. Calling ExecMethod on
    // the same IWbemServices while a forward-only enumerator is still open is
    // the one structural difference from the `Get-CimInstance` | `Invoke-CimMethod`
    // sequence this is known to work as, so it is not worth keeping.
    let mut targets: Vec<(String, String)> = Vec::new();
    loop {
      let mut batch: [Option<IWbemClassObject>; 1] = [None];
      let mut returned = 0u32;
      let _ = enumerator.Next(WBEM_INFINITE as i32, &mut batch, &mut returned);
      if returned == 0 {
        break;
      }
      let Some(object) = batch[0].take() else { break };

      let Some(instance_name) = property(&object, w!("InstanceName"), variant_string) else {
        log::warn!("a WmiMonitorDescriptorMethods instance has no InstanceName");
        continue;
      };
      // ExecMethod addresses the instance by path, not by the object itself.
      let path = property(&object, w!("__RELPATH"), variant_string)
        .or_else(|| property(&object, w!("__PATH"), variant_string));
      let Some(path) = path else {
        log::warn!("{instance_name} has neither __RELPATH nor __PATH");
        continue;
      };
      targets.push((instance_name, path));
    }
    drop(enumerator);
    log::info!("WMI listed {} monitor instance(s)", targets.len());

    let mut out = HashMap::new();
    for (instance_name, path) in targets {
      let edid = read_all_blocks(&services, &in_signature, &instance_name, &path);
      // Logged at info so an installed release build still shows it: this line
      // is how you tell a monitor's extension blocks arrived.
      log::info!(
        "WMI returned {} block(s) for {instance_name}",
        edid.len() / EDID_BLOCK_LEN
      );
      if !edid.is_empty() {
        out.insert(normalize_instance_name(&instance_name), edid);
      }
    }

    Ok(out)
  }

  unsafe fn collect_on_com_thread() -> Result<HashMap<String, Vec<u8>>, String> {
    let init = CoInitializeEx(None, COINIT_MULTITHREADED);
    if init.is_err() {
      return Err(format!("CoInitializeEx failed: {init:?}"));
    }
    let result = query_monitor_edids();
    CoUninitialize();
    result
  }

  /// Full E-EDIDs keyed by [`normalize_instance_name`].
  pub fn raw_edids_by_instance() -> Result<HashMap<String, Vec<u8>>, String> {
    // WMI gets an apartment of its own. The thread Tauri runs commands on is
    // shared with a webview host that has already initialised COM as an STA,
    // and calling CoUninitialize there would be hostile.
    std::thread::spawn(|| unsafe { collect_on_com_thread() })
      .join()
      .map_err(|_| "the WMI worker thread panicked".to_string())?
  }
}

#[cfg(target_os = "windows")]
mod platform {
  use super::{best_edid, connector_label, device_parameters_path, normalize_instance_name};
  use std::collections::HashMap;
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

  /// The registry's cached copy of one monitor's EDID, which is often just the
  /// base block. See [`best_edid`].
  fn registry_edid(instance_id: &str) -> Option<Vec<u8>> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let params = hklm.open_subkey(device_parameters_path(instance_id)).ok()?;
    let value = params.get_raw_value("EDID").ok()?;
    (!value.bytes.is_empty()).then_some(value.bytes)
  }

  /// SetupAPI decides *which* monitors are attached; the bytes come from WMI
  /// where it can supply them, and from the registry otherwise.
  pub fn collect() -> Result<Vec<(Option<String>, Vec<u8>)>, String> {
    // A machine without the WMI monitor provider still gets base blocks from
    // the registry, so this is never fatal on its own.
    let mut by_instance: HashMap<String, Vec<u8>> = super::wmi_edid::raw_edids_by_instance()
      .unwrap_or_else(|e| {
        log::warn!("falling back to the registry for every display: {e}");
        HashMap::new()
      });

    let mut found = Vec::new();
    for instance_id in present_monitor_instance_ids()? {
      let from_wmi = by_instance.remove(&normalize_instance_name(&instance_id));
      if from_wmi.is_none() {
        log::warn!(
          "no WMI EDID matched {instance_id}; its extension blocks may be missing"
        );
      }
      let from_registry = registry_edid(&instance_id);
      let registry_blocks = from_registry.as_ref().map_or(0, |b| b.len() / 128);
      if let Some(bytes) = best_edid(from_wmi, from_registry) {
        log::info!(
          "{instance_id}: using {} block(s), registry alone had {registry_blocks}",
          bytes.len() / 128
        );
        found.push((connector_label(&instance_id), bytes));
      }
    }

    // Left over means the two APIs disagree about how a monitor is named, which
    // would silently cost that display its extension blocks above.
    for unmatched in by_instance.keys() {
      log::warn!("WMI reported an EDID for {unmatched}, which SetupAPI did not list");
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

  /// A base block plus `blocks - 1` extensions, distinguishable by `tail`.
  fn valid_edid_of(blocks: usize, tail: u8) -> Vec<u8> {
    let mut v = vec![0u8; 128 * blocks];
    v[..8].copy_from_slice(&EDID_MAGIC);
    v[127] = tail;
    v
  }

  fn valid_edid(tail: u8) -> Vec<u8> {
    valid_edid_of(1, tail)
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
      // Blocks vs. the declared count is the useful line here: a display whose
      // extensions are missing shows 1 block against a non-zero byte 126.
      println!(
        "  {} connector={:?} {} bytes = {} block(s), byte 126 declares {} extension(s), header_ok={}",
        d.id,
        d.connector,
        d.bytes.len(),
        d.bytes.len() / 128,
        d.bytes[126],
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

  /// SetupAPI reports the bare instance path, WMI appends an output index.
  #[test]
  fn normalizes_the_two_spellings_of_one_instance_to_the_same_key() {
    assert_eq!(
      normalize_instance_name(r"DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353_0"),
      normalize_instance_name(r"DISPLAY\GSM5B09\5&2a1bd7b&0&UID4353")
    );
    assert_eq!(
      normalize_instance_name(r"display\gsm5b09\5&2a1bd7b&0&uid4353"),
      r"DISPLAY\GSM5B09\5&2A1BD7B&0&UID4353"
    );
  }

  /// An underscore is legal inside an instance path, so only a trailing numeric
  /// suffix may be stripped.
  #[test]
  fn keeps_an_underscore_that_is_not_an_output_index() {
    assert_eq!(
      normalize_instance_name(r"DISPLAY\ABC1234\4&AB_CD&0&UID256"),
      r"DISPLAY\ABC1234\4&AB_CD&0&UID256"
    );
  }

  /// The bug this whole WMI path exists for: the registry cached only the base
  /// block while the panel really reports an extension.
  #[test]
  fn prefers_the_wmi_read_that_carries_extension_blocks() {
    let chosen = best_edid(Some(valid_edid_of(2, 1)), Some(valid_edid_of(1, 1))).unwrap();
    assert_eq!(chosen.len(), 256);
  }

  /// A WMI read that stopped early must not lose bytes the registry already had.
  #[test]
  fn keeps_the_registry_copy_when_it_is_the_longer_one() {
    let chosen = best_edid(Some(valid_edid_of(1, 1)), Some(valid_edid_of(2, 1))).unwrap();
    assert_eq!(chosen.len(), 256);
  }

  #[test]
  fn falls_back_to_whichever_source_produced_anything() {
    assert!(best_edid(Some(valid_edid_of(1, 1)), None).is_some());
    assert!(best_edid(None, Some(valid_edid_of(1, 1))).is_some());
    assert!(best_edid(None, None).is_none());
  }

  /// A truncated or headerless blob from one source must not beat a good one
  /// from the other just by being longer.
  #[test]
  fn ignores_a_source_that_did_not_return_an_edid() {
    assert_eq!(
      best_edid(Some(vec![0xAB; 256]), Some(valid_edid_of(1, 1))).unwrap().len(),
      128
    );
    assert!(best_edid(Some(vec![0u8; 4]), None).is_none());
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
