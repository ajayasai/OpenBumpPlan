# Dual-chiplet package / synthetic demonstrator

Interface-control document | OpenBumpPlan 0.1.0

Revision: 1 | Review ID: c6c35747 | Units: um

**PLANNING CHECKS PASS - NOT SIGNOFF**

Public synthetic data: two dies, five physical stages, differential links, clocks, power/ground, and reserved sites. No customer design data.

## Coordinate convention

All canonical coordinates are micrometres. Positive Y is up. Die ports use local coordinates; die transforms mirror local X first, rotate counter-clockwise about the local origin, then translate to package XY. Other ports use package XY. Screen exploded offsets are never used for scoring.

## Planning metrics

122 sites; 96 assignments; 25,920 um total L1; 0 straight-line crossings; 0 errors; 0 warnings. Score: 25,920.

## Mechanical interfaces

| Die | Origin X | Origin Y | Width | Height | Rotation | Mirror X |
|---|---:|---:|---:|---:|---:|---|
| CORE | 200 | 300 | 2300 | 2500 | 0 | false |
| IO | 6200 | 300 | 2300 | 2500 | 90 | false |

## Interface assignments

| Source | Destination | Effective net | Domain | Role | L1 (um) | Locked |
|---|---|---|---|---|---:|---|
| CORE:pad:1 | CORE:bump:1 | GND | GND | ground | 120 | false |
| CORE:bump:1 | CORE:interposer:1 | GND | GND | ground | 220 | false |
| CORE:ball:1 | CORE:pcb:1 | GND | GND | ground | 340 | false |
| CORE:pad:2 | CORE:bump:2 | CORE_CLK | CORE | clock | 120 | false |
| CORE:bump:2 | CORE:interposer:2 | CORE_CLK | CORE | clock | 220 | false |
| CORE:ball:2 | CORE:pcb:2 | CORE_CLK | CORE | clock | 340 | false |
| CORE:pad:3 | CORE:bump:3 | GND | GND | ground | 120 | false |
| CORE:bump:3 | CORE:interposer:3 | GND | GND | ground | 220 | false |
| CORE:ball:3 | CORE:pcb:3 | GND | GND | ground | 340 | false |
| CORE:pad:4 | CORE:bump:4 | VDD_CORE | CORE | power | 120 | false |
| CORE:bump:4 | CORE:interposer:4 | VDD_CORE | CORE | power | 220 | false |
| CORE:ball:4 | CORE:pcb:4 | VDD_CORE | CORE | power | 340 | false |
| CORE:pad:5 | CORE:bump:5 | CORE_TX_P | CORE | signal | 120 | false |
| CORE:bump:5 | CORE:interposer:5 | CORE_TX_P | CORE | signal | 220 | false |
| CORE:ball:5 | CORE:pcb:5 | CORE_TX_P | CORE | signal | 340 | false |
| CORE:pad:6 | CORE:bump:6 | CORE_TX_N | CORE | signal | 120 | false |
| CORE:bump:6 | CORE:interposer:6 | CORE_TX_N | CORE | signal | 220 | false |
| CORE:ball:6 | CORE:pcb:6 | CORE_TX_N | CORE | signal | 340 | false |
| CORE:pad:7 | CORE:bump:7 | GND | GND | ground | 120 | false |
| CORE:bump:7 | CORE:interposer:7 | GND | GND | ground | 220 | false |
| CORE:ball:7 | CORE:pcb:7 | GND | GND | ground | 340 | false |
| CORE:pad:8 | CORE:bump:8 | VDD_CORE | CORE | power | 120 | false |
| CORE:bump:8 | CORE:interposer:8 | VDD_CORE | CORE | power | 220 | false |
| CORE:ball:8 | CORE:pcb:8 | VDD_CORE | CORE | power | 340 | false |
| CORE:pad:9 | CORE:bump:9 | CORE_DATA0 | CORE | signal | 120 | false |
| CORE:bump:9 | CORE:interposer:9 | CORE_DATA0 | CORE | signal | 220 | false |
| CORE:ball:9 | CORE:pcb:9 | CORE_DATA0 | CORE | signal | 340 | false |
| CORE:pad:10 | CORE:bump:10 | CORE_DATA1 | CORE | signal | 120 | false |
| CORE:bump:10 | CORE:interposer:10 | CORE_DATA1 | CORE | signal | 220 | false |
| CORE:ball:10 | CORE:pcb:10 | CORE_DATA1 | CORE | signal | 340 | false |
| CORE:pad:11 | CORE:bump:11 | GND | GND | ground | 120 | false |
| CORE:bump:11 | CORE:interposer:11 | GND | GND | ground | 220 | false |
| CORE:ball:11 | CORE:pcb:11 | GND | GND | ground | 340 | false |
| CORE:pad:12 | CORE:bump:12 | VDD_CORE | CORE | power | 120 | false |
| CORE:bump:12 | CORE:interposer:12 | VDD_CORE | CORE | power | 220 | false |
| CORE:ball:12 | CORE:pcb:12 | VDD_CORE | CORE | power | 340 | false |
| IO:pad:1 | IO:bump:1 | GND | GND | ground | 120 | false |
| IO:bump:1 | IO:interposer:1 | GND | GND | ground | 340 | false |
| IO:ball:1 | IO:pcb:1 | GND | GND | ground | 340 | false |
| IO:pad:2 | IO:bump:2 | IO_CLK | IO | clock | 120 | false |
| IO:bump:2 | IO:interposer:2 | IO_CLK | IO | clock | 340 | false |
| IO:ball:2 | IO:pcb:2 | IO_CLK | IO | clock | 340 | false |
| IO:pad:3 | IO:bump:3 | GND | GND | ground | 120 | false |
| IO:bump:3 | IO:interposer:3 | GND | GND | ground | 340 | false |
| IO:ball:3 | IO:pcb:3 | GND | GND | ground | 340 | false |
| IO:pad:4 | IO:bump:4 | VDD_IO | IO | power | 120 | false |
| IO:bump:4 | IO:interposer:4 | VDD_IO | IO | power | 340 | false |
| IO:ball:4 | IO:pcb:4 | VDD_IO | IO | power | 340 | false |
| IO:pad:5 | IO:bump:5 | IO_TX_P | IO | signal | 120 | false |
| IO:bump:5 | IO:interposer:5 | IO_TX_P | IO | signal | 340 | false |
| IO:ball:5 | IO:pcb:5 | IO_TX_P | IO | signal | 340 | false |
| IO:pad:6 | IO:bump:6 | IO_TX_N | IO | signal | 120 | false |
| IO:bump:6 | IO:interposer:6 | IO_TX_N | IO | signal | 340 | false |
| IO:ball:6 | IO:pcb:6 | IO_TX_N | IO | signal | 340 | false |
| IO:pad:7 | IO:bump:7 | GND | GND | ground | 120 | false |
| IO:bump:7 | IO:interposer:7 | GND | GND | ground | 340 | false |
| IO:ball:7 | IO:pcb:7 | GND | GND | ground | 340 | false |
| IO:pad:8 | IO:bump:8 | VDD_IO | IO | power | 120 | false |
| IO:bump:8 | IO:interposer:8 | VDD_IO | IO | power | 340 | false |
| IO:ball:8 | IO:pcb:8 | VDD_IO | IO | power | 340 | false |
| IO:pad:9 | IO:bump:9 | IO_DATA0 | IO | signal | 120 | false |
| IO:bump:9 | IO:interposer:9 | IO_DATA0 | IO | signal | 340 | false |
| IO:ball:9 | IO:pcb:9 | IO_DATA0 | IO | signal | 340 | false |
| IO:pad:10 | IO:bump:10 | IO_DATA1 | IO | signal | 120 | false |
| IO:bump:10 | IO:interposer:10 | IO_DATA1 | IO | signal | 340 | false |
| IO:ball:10 | IO:pcb:10 | IO_DATA1 | IO | signal | 340 | false |
| IO:pad:11 | IO:bump:11 | GND | GND | ground | 120 | false |
| IO:bump:11 | IO:interposer:11 | GND | GND | ground | 340 | false |
| IO:ball:11 | IO:pcb:11 | GND | GND | ground | 340 | false |
| IO:pad:12 | IO:bump:12 | VDD_IO | IO | power | 120 | false |
| IO:bump:12 | IO:interposer:12 | VDD_IO | IO | power | 340 | false |
| IO:ball:12 | IO:pcb:12 | VDD_IO | IO | power | 340 | false |
| CORE:interposer:5 | CORE:ball:5 | CORE_TX_P | CORE | signal | 340 | false |
| CORE:interposer:6 | CORE:ball:6 | CORE_TX_N | CORE | signal | 340 | false |
| IO:interposer:5 | IO:ball:5 | IO_TX_P | IO | signal | 340 | false |
| IO:interposer:6 | IO:ball:6 | IO_TX_N | IO | signal | 340 | false |
| CORE:interposer:1 | CORE:ball:1 | GND | GND | ground | 340 | false |
| CORE:interposer:10 | CORE:ball:10 | CORE_DATA1 | CORE | signal | 340 | false |
| CORE:interposer:11 | CORE:ball:11 | GND | GND | ground | 340 | false |
| CORE:interposer:12 | CORE:ball:12 | VDD_CORE | CORE | power | 340 | false |
| CORE:interposer:2 | CORE:ball:2 | CORE_CLK | CORE | clock | 340 | false |
| CORE:interposer:3 | CORE:ball:3 | GND | GND | ground | 340 | false |
| CORE:interposer:4 | CORE:ball:4 | VDD_CORE | CORE | power | 340 | false |
| CORE:interposer:7 | CORE:ball:7 | GND | GND | ground | 340 | false |
| CORE:interposer:8 | CORE:ball:8 | VDD_CORE | CORE | power | 340 | false |
| CORE:interposer:9 | CORE:ball:9 | CORE_DATA0 | CORE | signal | 340 | false |
| IO:interposer:1 | IO:ball:1 | GND | GND | ground | 340 | false |
| IO:interposer:10 | IO:ball:10 | IO_DATA1 | IO | signal | 340 | false |
| IO:interposer:11 | IO:ball:11 | GND | GND | ground | 340 | false |
| IO:interposer:12 | IO:ball:12 | VDD_IO | IO | power | 340 | false |
| IO:interposer:2 | IO:ball:2 | IO_CLK | IO | clock | 340 | false |
| IO:interposer:3 | IO:ball:3 | GND | GND | ground | 340 | false |
| IO:interposer:4 | IO:ball:4 | VDD_IO | IO | power | 340 | false |
| IO:interposer:7 | IO:ball:7 | GND | GND | ground | 340 | false |
| IO:interposer:8 | IO:ball:8 | VDD_IO | IO | power | 340 | false |
| IO:interposer:9 | IO:ball:9 | IO_DATA0 | IO | signal | 340 | false |

## Constraints

```json
{
  "rules": {
    "maxLength": 2600,
    "minDomainSpacing": 250,
    "pairMaxDistance": 650,
    "pairMaxSkew": 150,
    "clockShieldRadius": 750,
    "clockGroundMin": 2,
    "groundRadius": 1500,
    "powerRadius": 1700,
    "requirePowerForSignals": true,
    "minGroundRatio": 0.2,
    "crossingWeight": 150,
    "maxCrossings": 0,
    "geometryBudget": 1000000,
    "terminalKind": "pcb",
    "requireCompletePaths": true,
    "allowedStagePairs": [
      [
        "pad",
        "bump"
      ],
      [
        "pad",
        "ball"
      ],
      [
        "bump",
        "interposer"
      ],
      [
        "bump",
        "ball"
      ],
      [
        "interposer",
        "ball"
      ],
      [
        "ball",
        "pcb"
      ]
    ]
  },
  "keepouts": [
    {
      "dieId": "CORE",
      "kinds": [
        "pad",
        "bump"
      ],
      "id": "core-corner",
      "x": 0,
      "y": 0,
      "width": 120,
      "height": 120
    }
  ],
  "regions": [
    {
      "kind": "ball",
      "domain": "",
      "minGround": 8,
      "minPower": 6,
      "id": "package-power-grid",
      "x": 0,
      "y": 0,
      "width": 7600,
      "height": 5000
    }
  ]
}
```

## Findings

No configured-rule findings.

## Review and limitations

Planning only. Crossings are same-stage straight-ratsnest crossings; overlaps are reported separately. L1 is not routed electrical length. Ground proximity and power quotas are geometric proxies, not SI/PI/EM/thermal results. No foundry/package signoff is implied. Unknown domains/nets and incomplete analysis block readiness. The review identifier and local audit are not cryptographic signatures.

Engineering owner: __________  Reviewer: __________  Approval date: __________
