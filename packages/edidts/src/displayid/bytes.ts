/**
 * Byte-level helpers shared by the DisplayID data block decoders.
 *
 * DisplayID stores multi-byte integers least significant byte first throughout
 * (v2.1a Table 1-3), so every reader here is little-endian.
 */

export function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

export function readUint24(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8) | ((data[offset + 2] ?? 0) << 16)) >>> 0
  );
}

export function readUint32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

export function writeUint16(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

export function writeUint24(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
}

export function writeUint32(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
  data[offset + 2] = (value >>> 16) & 0xff;
  data[offset + 3] = (value >>> 24) & 0xff;
}

/**
 * Formats a 3-byte IEEE OUI for display.
 *
 * The numeric `ieeeOui` fields pack the three bytes little-endian, matching how
 * the rest of this package stores DisplayID integers; this renders them back in
 * the wire order the IEEE registry uses (first byte first).
 */
export function formatIeeeOui(ieeeOui: number): string {
  const first = ieeeOui & 0xff;
  const second = (ieeeOui >> 8) & 0xff;
  const third = (ieeeOui >> 16) & 0xff;
  return [first, second, third].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join('-');
}

export function decodeAscii(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
}

export function encodeAscii(value: string): Uint8Array {
  return new Uint8Array(Array.from(value, (character) => character.charCodeAt(0) & 0xff));
}

/** Expands a bitmask into the list of labels whose bit is set. */
export function decodeBitList(mask: number, labels: readonly number[]): number[] {
  const set: number[] = [];
  labels.forEach((label, bit) => {
    if ((mask & (1 << bit)) !== 0) set.push(label);
  });
  return set;
}

/** Inverse of decodeBitList. */
export function encodeBitList(values: readonly number[], labels: readonly number[]): number {
  let mask = 0;
  labels.forEach((label, bit) => {
    if (values.includes(label)) mask |= 1 << bit;
  });
  return mask;
}
