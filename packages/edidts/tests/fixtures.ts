// Auto-generated EDID fixtures from goedid parser samples

import { hexToUint8Array } from "./fixture-utils";

// Appendix A Example 1 — LCD Desktop IT Display (256 bytes, base EDID + CEA extension)
export const APPENDIX_A_EXAMPLE_1_HEX =
  "00,FF,FF,FF,FF,FF,FF,00,34,A9,1C,D1,01,01,01,01," +
  "00,19,01,03,80,DD,7D,78,0A,06,12,AF,51,4E,AD,24," +
  "0B,4C,51,20,08,00,A9,C0,A9,40,90,40,01,01,01,01," +
  "01,01,01,01,01,01,08,E8,00,30,F2,70,5A,80,B0,58," +
  "8A,00,1C,00,74,00,00,1E,02,3A,80,18,71,38,2D,40," +
  "58,2C,45,00,1C,00,74,00,00,1E,00,00,00,FC,00,45," +
  "54,2D,4D,44,4E,48,4D,31,30,0A,20,20,00,00,00,FD," +
  "00,17,79,0F,96,3C,00,0A,20,20,20,20,20,20,01,75," +
  "02,03,41,B1,57,61,60,5F,5E,5D,66,65,64,63,62,3F," +
  "10,1F,05,14,22,21,20,04,13,02,11,01,E3,05,E0,00," +
  "6E,03,0C,00,10,00,38,3C,20,08,80,01,02,03,04,67," +
  "D8,5D,C4,01,78,80,03,E2,00,FF,E2,0F,63,E3,06,0D," +
  "01,28,3C,80,A0,70,B0,23,40,30,20,36,00,66,00,64," +
  "00,00,1A,00,00,00,00,00,00,00,00,00,00,00,00,00," +
  "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00," +
  "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,5A";

export const APPENDIX_A_EXAMPLE_1 = hexToUint8Array(APPENDIX_A_EXAMPLE_1_HEX);

// DisplayID v2.0 EDID Extension Section example (256 bytes).
//
// The base block is the one from APPENDIX_A_EXAMPLE_1; its CEA extension is
// replaced with a DisplayID extension (tag 70h) carrying Product
// Identification, Display Parameters, Display Interface Features, Type VII
// detailed timings, and an Adaptive-Sync block, laid out per DisplayID v2.1a
// Section 2.1.
export const DISPLAYID_V2_EXTENSION_HEX =
  "00,FF,FF,FF,FF,FF,FF,00,34,A9,1C,D1,01,01,01,01," +
  "00,19,01,03,80,DD,7D,78,0A,06,12,AF,51,4E,AD,24," +
  "0B,4C,51,20,08,00,A9,C0,A9,40,90,40,01,01,01,01," +
  "01,01,01,01,01,01,08,E8,00,30,F2,70,5A,80,B0,58," +
  "8A,00,1C,00,74,00,00,1E,02,3A,80,18,71,38,2D,40," +
  "58,2C,45,00,1C,00,74,00,00,1E,00,00,00,FC,00,45," +
  "54,2D,4D,44,4E,48,4D,31,30,0A,20,20,00,00,00,FD," +
  "00,17,79,0F,96,3C,00,0A,20,20,20,20,20,20,01,75," +
  "70,20,79,05,00,20,00,14,00,1A,2B,34,12,78,56,34," +
  "12,0F,19,08,47,61,6D,69,6E,67,20,34,21,01,1D,00," +
  "10,70,08,00,0F,70,08,00,CC,EA,51,45,64,A6,66,42," +
  "0D,FD,34,54,40,5E,D0,5F,00,38,13,78,26,00,09,0E," +
  "0E,07,07,00,60,61,00,00,22,02,28,C7,7E,08,88,FF," +
  "0F,4F,00,07,80,1F,00,6F,08,3D,00,2F,00,07,00,C7," +
  "08,02,08,7F,07,4F,00,07,80,1F,00,37,04,1E,00,10," +
  "00,07,00,2B,00,06,05,14,30,8F,00,08,00,00,4D,90";

export const DISPLAYID_V2_EXTENSION = hexToUint8Array(DISPLAYID_V2_EXTENSION_HEX);


// MSI MAG 272URDF (384 bytes): base block + CTA-861 extension + a DisplayID
// *v1.2* extension carrying a Type I detailed timing block.
//
// Two things about this dump are load-bearing as a regression test:
//   1. Byte 126 declares 1 extension block while 2 are present, all three
//      blocks having a valid checksum.
//   2. The DisplayID section is Structure v1.2 (version byte 12h), which uses
//      the legacy 00h-1Fh data block tag space.
export const MSI_MAG272URDF_DISPLAYID_V1_HEX =
  "00,FF,FF,FF,FF,FF,FF,00,36,69,E7,3C,00,00,00,00,"  +
  "2C,22,01,03,80,3C,22,78,2A,8C,85,AC,51,47,A7,27,"  +
  "0B,50,54,BF,CF,00,71,4F,81,C0,81,40,81,80,95,00,"  +
  "B3,00,D1,C0,01,01,4D,D0,00,A0,F0,70,3E,80,30,40,"  +
  "35,00,55,50,21,00,00,1A,02,3A,80,18,71,38,2D,40,"  +
  "58,2C,45,00,55,50,21,00,00,1E,00,00,00,FD,08,30,"  +
  "A0,1E,7D,96,00,0A,20,20,20,20,20,20,00,00,00,FC,"  +
  "00,4D,41,47,20,32,37,32,55,52,44,46,0A,20,01,C5,"  +
  "02,03,52,F1,E2,78,02,4C,01,03,02,04,90,12,11,13,"  +
  "3F,2F,61,76,23,09,17,07,83,01,00,00,67,03,0C,00,"  +
  "10,00,38,44,6D,D8,5D,C4,01,78,80,63,02,30,A0,83,"  +
  "65,23,6D,1A,00,00,02,03,30,A0,E6,00,00,00,00,00,"  +
  "E3,05,E3,01,E3,0F,00,0C,E6,06,07,01,61,56,1C,E2,"  +
  "00,6A,56,5E,00,A0,A0,A0,29,50,30,20,35,00,55,50,"  +
  "21,00,00,1A,6F,C2,00,A0,A0,A0,55,50,30,20,35,00,"  +
  "55,50,21,00,00,1A,00,00,00,00,00,00,00,00,00,E0,"  +
  "70,12,79,03,00,03,01,3C,FB,F2,01,04,FF,0E,9F,00,"  +
  "2F,80,1F,00,6F,08,3B,00,30,00,04,00,CE,AC,01,04,"  +
  "FF,0E,9F,00,6F,80,1F,00,6F,08,7E,00,76,00,04,00,"  +
  "FF,23,02,04,FF,0E,9F,00,2F,80,1F,00,6F,08,1F,00,"  +
  "0B,00,04,00,00,00,00,00,00,00,00,00,00,00,00,00,"  +
  "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,"  +
  "00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,00,"  +
  "00,00,00,00,00,00,00,00,00,00,00,00,00,00,F1,90";

export const MSI_MAG272URDF_DISPLAYID_V1 = hexToUint8Array(MSI_MAG272URDF_DISPLAYID_V1_HEX);
