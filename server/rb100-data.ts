/**
 * RB100 Engineering Data — Condensed reference for LLM system prompt.
 * Source: Altaspan RB100 Structural Specification
 * This data is injected into the AI Assistant's system prompt so it can
 * answer engineering queries about beam spans, roof sheeting, posts, footings, etc.
 */

export const RB100_SYSTEM_CONTEXT = `
## SPANLINE RB100 ENGINEERING REFERENCE DATA

### WIND CLASSES
| Class | Pressure (kPa) | Group |
|-------|----------------|-------|
| N1 | 0.44 | Non-cyclonic |
| N2 | 0.65 | Non-cyclonic |
| N3 | 1.01 | Non-cyclonic |
| N4 | 1.50 | Non-cyclonic |
| C1 | 1.01 | Cyclonic |
| C2 | 1.50 | Cyclonic |
| C3 | 2.16 | Cyclonic |
| C4 | 2.94 | Cyclonic |

Cyclonic equivalents for Altaspan profiles (non-Versiclad): C1→use N3 data, C2→use N4 data, C3/C4→not supported (specific engineering required).
Versiclad insulated panels have native cyclonic data for C1, C2, C3.

### PRESSURE COEFFICIENTS (Cp'n)
| Enclosure Condition | Cp'n |
|---------------------|------|
| Open 3 Sides (Single Storey) | 0.45 |
| Open 3 Sides (Double Storey) | 0.7 |
| Open 2 Sides | 1.0 |
| Open 1 Side | 1.2 |
| Screen Enclosed (N & C Areas) | 1.1 |
| Fully Enclosed - N Areas | 1.2 |

### TABLE 1 — ROOF SHEETING MAXIMUM SPANS (mm)

#### Double-U Profile (Min fall: 1°, Fastener: 12-14x35mm TEK Screws Crest Fitment)

**0.42mm G550:**
| Wind | Overhang | Cp'n 0.45 | Cp'n 0.7 | Cp'n 1.0 | Cp'n 1.1 | Cp'n 1.2 |
|------|----------|-----------|----------|----------|----------|----------|
| N1 | 900mm | 5000 | 4700 | 4500 | 4275 | 4050 |
| N2 | 900mm | 5000 | 4700 | 4300 | 4100 | 4000 |
| N3 | 600mm | 4400 | 4100 | 3900 | 3800 | 3700 |
| N4 | 600mm | 4150 | 3850 | 3400 | 3200 | 3100 |

**0.48mm G550:**
| Wind | Overhang | Cp'n 0.45 | Cp'n 0.7 | Cp'n 1.0 | Cp'n 1.1 | Cp'n 1.2 |
|------|----------|-----------|----------|----------|----------|----------|
| N1 | 1200mm | 5700 | 5400 | 4900 | 4700 | 4700 |
| N2 | 1200mm | 5500 | 5100 | 4700 | 4700 | 4700 |
| N3 | 900mm | 5100 | 4700 | 4700 | 4700 | 4700 |
| N4 | 900mm | 4500 | 4700 | 4700 | 4700 | 4000 |

#### Slendek Profile (Min fall: 1°, Fastener: 12-14x35mm TEK Screws Pan Fitment)

**0.42mm G550:**
| Wind | Overhang | Cp'n 0.45 | Cp'n 0.7 | Cp'n 1.0 | Cp'n 1.1 | Cp'n 1.2 |
|------|----------|-----------|----------|----------|----------|----------|
| N1 | 600mm | 4750 | 4700 | 4500 | 4270 | 4050 |
| N2 | 600mm | 4750 | 4700 | 4300 | 4000 | 3700 |
| N3 | 600mm | 4300 | 4000 | 3600 | 3225 | 3100 |
| N4 | 600mm | 4100 | 3500 | 3000 | N/A | N/A |

**0.48mm G550:**
| Wind | Overhang | Cp'n 0.45 | Cp'n 0.7 | Cp'n 1.0 | Cp'n 1.1 | Cp'n 1.2 |
|------|----------|-----------|----------|----------|----------|----------|
| N1 | 750mm | 5150 | 5100 | 4700 | 4670 | 4570 |
| N2 | 750mm | 5100 | 5000 | 4600 | 4500 | 4400 |
| N3 | 600mm | 4500 | 4200 | 3850 | 3700 | 3500 |
| N4 | 600mm | 4300 | 3750 | 3450 | 3300 | 3150 |

### VERSICLAD INSULATED PANELS — Maximum Spans (mm)

#### Corrolink 1000 (Corrugated SIRP, Min fall: 1°, Max side overhang: 450mm)
Fastener: 14g self-drilling screws, 7 per panel at each support. Max overhang: 25% of span.

| Wind | Panel(mm) | Fully Enclosed | One Side Open | 2-3 Sides Open |
|------|-----------|---------------|---------------|-----------------|
| N1 | 50 | 7515 | 6776 | 7515 |
| N1 | 75 | 8958 | 8077 | 8958 |
| N1 | 100 | 9343 | 8425 | 9343 |
| N1 | 125 | 9742 | 8785 | 9742 |
| N1 | 150 | 10618 | 9574 | 10618 |
| N1 | 180 | 11218 | 10115 | 11218 |
| N2 | 50 | 6284 | 5697 | 6284 |
| N2 | 75 | 7489 | 6789 | 7489 |
| N2 | 100 | 7811 | 7082 | 7811 |
| N2 | 125 | 8143 | 7383 | 8143 |
| N2 | 150 | 8876 | 8047 | 8876 |
| N2 | 180 | 9378 | 8502 | 9378 |
| N3 | 50 | 4947 | 4494 | 4947 |
| N3 | 75 | 5895 | 5356 | 5895 |
| N3 | 100 | 6149 | 5586 | 6149 |
| N3 | 125 | 6410 | 5823 | 6410 |
| N3 | 150 | 6987 | 6347 | 6987 |
| N3 | 180 | 7382 | 6706 | 7382 |
| N4 | 50 | 4021 | 3656 | 4021 |
| N4 | 75 | 4793 | 4357 | 4793 |
| N4 | 100 | 5000 | 4543 | 5000 |
| N4 | 125 | 5211 | 4735 | 5211 |
| N4 | 150 | 5680 | 5162 | 5680 |
| N4 | 180 | 6001 | 5454 | 6001 |

#### Versiclad Flatdek 1000 (Flat SIRP)
Similar structure. Key spans for N1-N4 and C1-C3 available.
| Wind | Panel(mm) | Fully Enclosed | One Side Open | 2-3 Sides Open |
|------|-----------|---------------|---------------|-----------------|
| N1 | 50 | 6893 | 6398 | 6893 |
| N1 | 75 | 8644 | 7794 | 8644 |
| N1 | 100 | 8726 | 7989 | 8726 |
| N1 | 125 | 9791 | 8828 | 9791 |
| N1 | 150 | 10568 | 9610 | 10568 |
| N2 | 50 | 6108 | 5539 | 6108 |
| N2 | 75 | 7195 | 6524 | 7195 |
| N2 | 100 | 7375 | 6687 | 7375 |
| N2 | 125 | 8149 | 7390 | 8149 |
| N2 | 150 | 8871 | 8044 | 8871 |
| N3 | 50 | 4807 | 4368 | 4807 |
| N3 | 75 | 5663 | 5145 | 5663 |
| N3 | 100 | 5804 | 5273 | 5804 |
| N3 | 125 | 6414 | 5827 | 6414 |
| N3 | 150 | 6982 | 6343 | 6982 |
| N4 | 50 | 3906 | 3552 | 3906 |
| N4 | 75 | 4601 | 4184 | 4601 |
| N4 | 100 | 4716 | 4289 | 4716 |
| N4 | 125 | 5212 | 4739 | 5212 |
| N4 | 150 | 5673 | 5159 | 5673 |
| C1 | 50 | 4572 | 3644 | 4807 |
| C1 | 75 | 5385 | 4293 | 5663 |
| C1 | 100 | 5520 | 4440 | 5804 |
| C1 | 125 | 6099 | 4862 | 6414 |
| C1 | 150 | 6640 | 5293 | 6982 |
| C2 | 50 | 3720 | 2973 | 3906 |
| C2 | 75 | 4382 | 3502 | 4601 |
| C2 | 100 | 4492 | 3590 | 4716 |
| C2 | 125 | 4964 | 3967 | 5212 |
| C2 | 150 | 5403 | 4318 | 5673 |
| C3 | 50 | 3048 | 2422 | 3201 |
| C3 | 75 | 3591 | 2876 | 3771 |
| C3 | 100 | 3680 | 2948 | 3866 |
| C3 | 125 | 4067 | 3258 | 4272 |
| C3 | 150 | 4427 | 3546 | 4650 |

### TABLE 2 — BEAM SPANS (mm)

Available beam sizes: 140x50x0.85 G300, 150x60x1.0 G550, 200x60x1.0 G550

#### EDGE SINGLE BEAMS — 140x50x0.85 G300
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 1800 | 1.2 | 5680 | 4620 | 3810 | 3140 |
| 2400 | 1.2 | 5150 | 4080 | 3210 | 2590 |
| 3000 | 1.2 | 4700 | 3740 | 2940 | 2370 |
| 3600 | 1.2 | 4340 | 3450 | 2720 | 2190 |
| 4200 | 1.2 | 4040 | 3210 | 2530 | N/A |
| 4800 | 1.2 | 3790 | 3010 | N/A | N/A |
| 6000 | 1.2 | 3380 | 2620 | N/A | N/A |
| 2400 | 1.0 | 6060 | 4810 | 3780 | 3050 |
| 3000 | 1.0 | 5540 | 4400 | 3460 | 2790 |
| 3600 | 1.0 | 5110 | 4060 | 3200 | 2580 |
| 4200 | 1.0 | 4760 | 3780 | 2970 | N/A |
| 4800 | 1.0 | 4460 | 3550 | N/A | N/A |
| 3300 | 0.7 | 5750 | 5130 | 4000 | 3210 |
| 3600 | 0.7 | 5650 | 4930 | 3840 | 3080 |
| 4200 | 0.7 | 5480 | 4580 | 3560 | 2850 |
| 4800 | 0.7 | 5230 | 4280 | 3370 | N/A |
| 5400 | 0.7 | 4910 | 4020 | N/A | N/A |

#### EDGE SINGLE BEAMS — 150x60x1.0 G550
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 1800 | 1.2 | 6650 | 6240 | 4950 | 4040 |
| 2400 | 1.2 | 6310 | 5740 | 4550 | 3700 |
| 3000 | 1.2 | 6000 | 5260 | 4170 | 3380 |
| 3600 | 1.2 | 5710 | 4870 | 3860 | 3130 |
| 4500 | 1.2 | 5370 | 4400 | 3490 | 2820 |
| 5400 | 1.2 | 5000 | 4030 | 3230 | 2580 |
| 6000 | 1.2 | 4790 | 3850 | 3130 | 2450 |
| 6500 | 1.2 | 4610 | 3730 | 2870 | 2190 |

#### EDGE SINGLE BEAMS — 200x60x1.0 G550
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 1800 | 1.2 | 8700 | 7390 | 5850 | 4760 |
| 2400 | 1.2 | 7930 | 6710 | 5310 | 4320 |
| 3000 | 1.2 | 7640 | 6150 | 4880 | 3960 |
| 3600 | 1.2 | 7070 | 5700 | 4510 | 3660 |
| 4200 | 1.2 | 6600 | 5320 | 4210 | 3420 |
| 4800 | 1.2 | 6200 | 5000 | 3950 | N/A |
| 5400 | 1.2 | 5860 | 4720 | 3780 | N/A |
| 6000 | 1.2 | 5590 | 4510 | N/A | N/A |

#### CENTRAL DOUBLE BEAMS — 140x50x0.85 G300
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 3600 | 1.2 | 6350 | 5500 | 4320 | 3490 |
| 4800 | 1.2 | 5780 | 4610 | 3630 | 2960 |
| 6000 | 1.2 | 5070 | 4040 | 3190 | 2580 |
| 7200 | 1.2 | 4570 | 3650 | 2880 | N/A |
| 8400 | 1.2 | 4190 | 3340 | N/A | N/A |
| 3600 | 1.0 | 7470 | 6470 | 5080 | 4110 |
| 4800 | 1.0 | 6810 | 5420 | 4270 | 3480 |
| 6000 | 1.0 | 5970 | 4750 | 3750 | 3040 |
| 7200 | 1.0 | 5380 | 4290 | 3390 | N/A |
| 3600 | 0.7 | 7580 | 7180 | 6690 | 5390 |
| 4800 | 0.7 | 7080 | 6580 | 5830 | 4550 |
| 6000 | 0.7 | 6560 | 6310 | 4960 | 4010 |
| 7200 | 0.7 | 6300 | 5690 | 4490 | 3630 |
| 9000 | 0.7 | 5990 | 5000 | 3950 | N/A |

#### CENTRAL DOUBLE BEAMS — 150x60x1.0 G550
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 3600 | 1.2 | 7640 | 7420 | 6660 | 5390 |
| 4800 | 1.2 | 7110 | 7000 | 5620 | 4560 |
| 6000 | 1.2 | 6530 | 6260 | 4950 | 4020 |
| 7200 | 1.2 | 6110 | 5650 | 4480 | 3640 |
| 8400 | 1.2 | 5640 | 4980 | 3940 | N/A |
| 3600 | 1.0 | 8990 | 8730 | 7840 | 6340 |
| 4800 | 1.0 | 8360 | 8240 | 6610 | 5360 |
| 6000 | 1.0 | 7680 | 7360 | 5820 | 4730 |
| 7200 | 1.0 | 7190 | 6640 | 5270 | 4280 |
| 3600 | 0.7 | 8990 | 8730 | 8730 | 7680 |
| 4800 | 0.7 | 8560 | 8310 | 8010 | 6480 |
| 6000 | 0.7 | 8200 | 7960 | 7050 | 5710 |
| 7200 | 0.7 | 7890 | 7660 | 6370 | 5160 |
| 9000 | 0.7 | 7140 | 6600 | 5220 | 4230 |

#### CENTRAL DOUBLE BEAMS — 200x60x1.0 G550
| Roof Proj(mm) | Cp'n | N1 | N2 | N3 | N4 |
|---------------|------|------|------|------|------|
| 3600 | 1.2 | 10110 | 9610 | 7710 | 6270 |
| 4800 | 1.2 | 9470 | 8220 | 6520 | 5290 |
| 6000 | 1.2 | 8960 | 7240 | 5750 | 4670 |
| 7200 | 1.2 | 8100 | 6550 | 5200 | 4230 |
| 8400 | 1.2 | 7150 | 5780 | 4590 | N/A |
| 3600 | 1.0 | 11900 | 11310 | 9070 | 7370 |
| 4800 | 1.0 | 11140 | 9670 | 7670 | 6230 |
| 6000 | 1.0 | 10540 | 8520 | 6770 | 5500 |
| 7200 | 1.0 | 9530 | 7700 | 6120 | 4980 |
| 3600 | 0.7 | 11900 | 11900 | 10990 | 8890 |
| 4800 | 0.7 | 11140 | 11140 | 9270 | 7520 |
| 6000 | 0.7 | 10540 | 10330 | 8170 | 6630 |
| 7200 | 0.7 | 10060 | 9330 | 7390 | 6000 |
| 9000 | 0.7 | 9140 | 7660 | 6070 | 4930 |

### TABLE 3A — POST OPTIONS

#### Duragal / Hot Dipped Galvanised (Steel)
| Size | Capacity (kN) | Max Height | TEK 12G | TEK 14G |
|------|---------------|------------|---------|---------|
| 50x50x1.6 | 7 | 3000mm | 4.2 | 4.8 |
| 65x65x2.0 | 18 | 3600mm | 4.2 | 4.8 |
| 75x75x3.5 | 23 | 4500mm | 4.2 | 4.8 |
| 89x89x3.5 | 38 | 4500mm | 4.2 | 4.8 |
| 90x90x2.0 | 29 | 4000mm | 4.2 | 4.8 |
| 100x100x3.0 | 50 | 5600mm | 4.2 | 4.8 |
| 100x100x5.0 | 55 | 6000mm | 4.2 | 4.8 |

#### Altaspan Aluminium
| Size | Capacity (kN) | Max Height | TEK 12G | TEK 14G | Wind Restriction |
|------|---------------|------------|---------|---------|-----------------|
| 50x50x2.0 radius | 5.6 | 2700mm | 2.3 | 2.7 | — |
| 50x50x1.6 square | 5.6 | 2400mm | 2.3 | 2.7 | — |
| 60x60x2.0 | 10 | 3200mm | 2.3 | 2.7 | — |
| 90x90x2.0 | 14 | 3800mm | 2.3 | 2.7 | N1, N2 only |
| 90x90x2.0 | 14 | 3600mm | 2.3 | 2.7 | N3, C1, N4 |

#### Timber Posts (F17 HW)
| Size | Capacity (kN) | Max Height | Fixing |
|------|---------------|------------|--------|
| 90x90 Merbau | 27.5 | 3600mm | Min. 2-M12 Bolts |
| 100x100 Kwila | 38 | 4000mm | Min. 2-M12 Bolts |

### TABLE 4 — FOOTINGS

#### Bored Pier - Clay (Cu=60kPa, no cohesion top 450mm)
Capacity in kN by diameter (m) and depth (m):
| Depth | Ø0.3 | Ø0.45 | Ø0.6 | Ø0.9 |
|-------|------|-------|------|------|
| 0.3 | 0.5 | 1.0 | 1.8 | 4.1 |
| 0.4 | 0.6 | 1.4 | 2.4 | 5.5 |
| 0.5 | 1.8 | 3.2 | 5.1 | 9.9 |
| 0.6 | 4.0 | 6.6 | 9.8 | 17.4 |
| 0.7 | 6.2 | 10.0 | 14.5 | 24.9 |
| 0.8 | 8.3 | 13.4 | 19.1 | 32.4 |
| 0.9 | 10.5 | 16.8 | 23.8 | 39.9 |
| 1.0 | 12.7 | 20.2 | 28.5 | 47.3 |

#### Square Footing - Clay (Cu=60kPa, no cohesion top 450mm)
Capacity in kN by B size (mm) and D depth (mm):
| D\\B | 400 | 500 | 600 | 700 | 800 | 900 | 1000 |
|-----|-----|-----|-----|-----|-----|-----|------|
| 400 | 1.4 | 2.2 | 3.2 | 4.3 | 5.6 | 7.1 | 8.8 |
| 500 | 3.5 | 4.9 | 6.5 | 8.3 | 10.4 | 12.6 | 15.1 |
| 600 | 7.3 | 9.2 | 11.7 | 14.4 | 17.3 | 20.4 | 23.8 |
| 700 | 11.1 | 14.6 | 18.4 | 22.5 | 27.0 | 31.7 | 36.7 |
| 800 | 14.9 | 19.4 | 24.4 | 29.6 | 35.3 | 41.2 | 47.5 |
| 900 | 18.7 | 24.3 | 30.3 | 36.7 | 45.3 | 50.7 | 58.3 |
| 1000 | 22.5 | 29.2 | 36.3 | 43.8 | 51.8 | 60.3 | 69.1 |

#### Square Footing - Sand
Capacity in kN by B size (mm) and D depth (mm):
| D\\B | 400 | 500 | 600 | 700 | 800 | 900 | 1000 |
|-----|-----|-----|-----|-----|-----|-----|------|
| 400 | 1.4 | 2.2 | 3.2 | 4.3 | 5.6 | 7.1 | 8.8 |
| 500 | 1.8 | 2.8 | 4.0 | 5.4 | 7.1 | 8.9 | 11.0 |
| 600 | 2.1 | 3.3 | 4.8 | 6.5 | 8.5 | 10.7 | 13.2 |
| 700 | 2.5 | 3.9 | 5.6 | 7.6 | 9.9 | 12.5 | 15.4 |
| 800 | 2.8 | 4.4 | 6.4 | 8.6 | 11.3 | 14.3 | 17.6 |
| 900 | 3.2 | 5.0 | 7.1 | 9.7 | 12.7 | 16.1 | 19.8 |
| 1000 | 3.5 | 5.5 | 7.9 | 10.8 | 14.1 | 17.9 | 22.1 |

### BOLT CAPACITIES (kN)

#### Dynabolt
| Size | Depth | 1 bolt | 2 bolts | 4 bolts |
|------|-------|--------|---------|---------|
| M8 | 30mm | 4 | 8 | 16 |
| M10 | 40mm | 8 | 16 | 32 |
| M12 | 50mm | 11 | 22 | 44 |

#### Anka Screw
| Size | Depth | 1 bolt | 2 bolts | 4 bolts |
|------|-------|--------|---------|---------|
| M8 | 60mm | 7 | 14 | 24 |
| M10 | 75mm | 9 | 18 | 36 |
| M12 | 90mm | 12 | 24 | 48 |

#### Chemset
| Size | Depth | 1 bolt | 2 bolts | 4 bolts |
|------|-------|--------|---------|---------|
| M12 | 110mm | 22 | 44 | 88 |

### RAFTER STRENGTHENING — Allowable Spans (m)

#### N1/N2 Sheet Roof (Truss Centres: 900mm)
| Truss Type | Existing | +1 Stiffener | Stiffener Size | +2 Stiffeners | +1 MS Plate |
|------------|----------|--------------|----------------|---------------|-------------|
| Metal 100Z10 | 2.36 | 3.92 | 90x35 F8 | 5.60 | 0.55 |
| 90x35 Pine MGP10 | 2.28 | 4.06 | 90x35 F8 | 5.96 | 4.26 |
| 100x50 F17 HW | 4.51 | 6.43 | 90x35 F8 | 6.53 | 2.57 |

#### N1/N2 Tile Roof (Truss Centres: 600mm)
| Truss Type | Existing | +1 Stiffener | Stiffener Size | +2 Stiffeners | +1 MS Plate |
|------------|----------|--------------|----------------|---------------|-------------|
| Metal 100Z10 | 2.60 | 4.16 | 90x35 F8 | 5.88 | 0.79 |
| 90x35 Pine MGP10 | 2.49 | 4.26 | 90x35 F8 | 6.20 | 4.50 |
| 100x50 F17 HW | 4.72 | 6.63 | 90x35 F8 | 6.75 | 2.76 |

#### N3 Sheet Roof (Truss Centres: 900mm)
| Truss Type | Existing | +1 Stiffener | Stiffener Size | +2 Stiffeners | +1 MS Plate |
|------------|----------|--------------|----------------|---------------|-------------|
| Metal 100Z10 | 2.12 | 3.68 | 90x35 F8 | 5.40 | 0.39 |
| 90x35 Pine MGP10 | 2.54 | 4.80 | 90x45 F8 | 5.72 | 4.04 |
| 100x50 F17 HW | 4.33 | 6.22 | 90x35 F8 | 6.30 | 2.37 |

#### N3 Tile Roof (Truss Centres: 600mm)
| Truss Type | Existing | +1 Stiffener | Stiffener Size | +2 Stiffeners | +1 MS Plate |
|------------|----------|--------------|----------------|---------------|-------------|
| Metal 100Z10 | 2.43 | 3.99 | 90x35 F8 | 5.71 | 0.66 |
| 90x35 Pine MGP10 | 2.80 | 5.07 | 90x45 F8 | 6.03 | 4.35 |
| 100x50 F17 HW | 4.59 | 6.50 | 90x35 F8 | 6.60 | 2.63 |

### CORROSION PROTECTION GUIDE
| Environment | Description | Treatment |
|-------------|-------------|-----------|
| Mild | > 10km from beach front or sheltered bay | Duragal + PC or better |
| Marine | 2-10km from beach front or > 100m of still salt water | Duragal + PC or Hot Dipped Galvanised |
| Severe Marine | Within 2km of beachfront or within 100m of still salt water | Hot Dipped Galvanised |

### IMPORTANT NOTES
- All spans are in millimetres unless stated otherwise.
- "N/A" means the configuration is not supported and requires specific engineering.
- For cyclonic areas using Altaspan profiles (not Versiclad): use C1→N3 data, C2→N4 data. C3/C4 require specific engineering.
- Versiclad insulated panels have native cyclonic data (C1, C2, C3 supported directly).
- Roof projection = the distance from the beam to the outer edge of the roof (one side only for edge beams, total for central beams).
- Cp'n (pressure coefficient) depends on enclosure condition — see the Pressure Coefficients table.
- Always verify post capacity exceeds the load from the beam span and roof area it supports.
- Footing capacity must exceed the post load plus any uplift forces.
`;
