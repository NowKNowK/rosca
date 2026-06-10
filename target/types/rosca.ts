/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rosca.json`.
 */
export type Rosca = {
  "address": "A2V2rfqjFiXAGiqBSX9BGUUyxRaaAQUtHs4amk5sHnyj",
  "metadata": {
    "name": "rosca",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "On-chain ROSCA (Rotating Savings and Credit Association)"
  },
  "instructions": [
    {
      "name": "cancelCircle",
      "discriminator": [
        235,
        90,
        15,
        94,
        27,
        245,
        101,
        23
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "circle",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "claimPayout",
      "discriminator": [
        127,
        240,
        132,
        62,
        227,
        198,
        146,
        133
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone can trigger the payout; tokens always go to recipient_token."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "recipientMember"
          ]
        },
        {
          "name": "recipientMember",
          "writable": true
        },
        {
          "name": "recipient"
        },
        {
          "name": "recipientToken",
          "docs": [
            "init_if_needed protects against griefing via ATA closure — payer recreates it."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "recipient"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "round",
          "type": "u8"
        }
      ]
    },
    {
      "name": "closeCircle",
      "discriminator": [
        249,
        63,
        161,
        46,
        147,
        239,
        34,
        37
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "circle",
          "writable": true
        },
        {
          "name": "creator",
          "writable": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "creatorToken",
          "docs": [
            "Any dust remaining in vault is swept to creator_token before closing vault."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "closeMember",
      "discriminator": [
        221,
        98,
        181,
        59,
        120,
        117,
        20,
        22
      ],
      "accounts": [
        {
          "name": "payer",
          "docs": [
            "Anyone can call this (permissionless). Pays rent for ATA recreation if needed."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "member",
          "writable": true
        },
        {
          "name": "memberOwner",
          "writable": true
        },
        {
          "name": "history",
          "docs": [
            "Global history for the member's user — updated on clean completion."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  105,
                  115,
                  116,
                  111,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "member.user",
                "account": "member"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "memberToken",
          "docs": [
            "init_if_needed protects against griefing: if member closed their ATA,",
            "payer recreates it so the transfer still goes through."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "memberOwner"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "contribute",
      "discriminator": [
        82,
        33,
        68,
        131,
        32,
        0,
        205,
        95
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "member",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "round",
          "type": "u8"
        }
      ]
    },
    {
      "name": "createCircle",
      "discriminator": [
        186,
        99,
        49,
        131,
        31,
        51,
        13,
        198
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "circle",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  105,
                  114,
                  99,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "arg",
                "path": "circleId"
              }
            ]
          }
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "vault",
          "docs": [
            "ATA(circle PDA, token_mint) — holds all contributions, collateral, and reserves."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "circle"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "circleId",
          "type": "u64"
        },
        {
          "name": "contributionAmount",
          "type": "u64"
        },
        {
          "name": "roundDuration",
          "type": "i64"
        },
        {
          "name": "gracePeriod",
          "type": "i64"
        },
        {
          "name": "startDeadline",
          "type": "i64"
        },
        {
          "name": "maxMembers",
          "type": "u8"
        },
        {
          "name": "exitPenaltyBps",
          "type": "u16"
        },
        {
          "name": "collateralBps",
          "type": "u16"
        },
        {
          "name": "requireCleanHistory",
          "type": "bool"
        }
      ]
    },
    {
      "name": "exitEarly",
      "discriminator": [
        53,
        140,
        162,
        82,
        176,
        90,
        126,
        53
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "member",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "join",
      "discriminator": [
        206,
        55,
        2,
        106,
        113,
        220,
        17,
        163
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "circle",
          "writable": true
        },
        {
          "name": "member",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  109,
                  98,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "circle"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "history",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  105,
                  115,
                  116,
                  111,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "leave",
      "discriminator": [
        59,
        234,
        148,
        108,
        107,
        149,
        173,
        112
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "member",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "slash",
      "discriminator": [
        204,
        141,
        18,
        161,
        8,
        177,
        92,
        142
      ],
      "accounts": [
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "circle",
          "writable": true,
          "relations": [
            "member"
          ]
        },
        {
          "name": "member",
          "docs": [
            "The member being slashed. NOT a signer — anyone can call slash."
          ],
          "writable": true
        },
        {
          "name": "history",
          "docs": [
            "Global history PDA for the member's user key."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  105,
                  115,
                  116,
                  111,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "member.user",
                "account": "member"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "missedRound",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "circle",
      "discriminator": [
        27,
        59,
        8,
        117,
        62,
        199,
        222,
        252
      ]
    },
    {
      "name": "member",
      "discriminator": [
        54,
        19,
        162,
        21,
        29,
        166,
        17,
        198
      ]
    },
    {
      "name": "memberHistory",
      "discriminator": [
        147,
        186,
        245,
        164,
        127,
        187,
        148,
        187
      ]
    }
  ],
  "events": [
    {
      "name": "circleCancelled",
      "discriminator": [
        157,
        78,
        233,
        166,
        164,
        172,
        132,
        75
      ]
    },
    {
      "name": "circleClosed",
      "discriminator": [
        205,
        90,
        185,
        247,
        113,
        234,
        159,
        176
      ]
    },
    {
      "name": "circleCompleted",
      "discriminator": [
        188,
        139,
        54,
        215,
        94,
        34,
        139,
        54
      ]
    },
    {
      "name": "circleCreated",
      "discriminator": [
        210,
        110,
        215,
        179,
        247,
        145,
        243,
        135
      ]
    },
    {
      "name": "circleStarted",
      "discriminator": [
        196,
        26,
        183,
        226,
        10,
        58,
        135,
        149
      ]
    },
    {
      "name": "contributionMade",
      "discriminator": [
        81,
        218,
        72,
        109,
        93,
        96,
        131,
        199
      ]
    },
    {
      "name": "memberClosed",
      "discriminator": [
        144,
        66,
        227,
        96,
        123,
        189,
        130,
        204
      ]
    },
    {
      "name": "memberExited",
      "discriminator": [
        68,
        17,
        143,
        254,
        130,
        192,
        117,
        169
      ]
    },
    {
      "name": "memberJoined",
      "discriminator": [
        156,
        199,
        149,
        88,
        193,
        203,
        191,
        210
      ]
    },
    {
      "name": "memberLeft",
      "discriminator": [
        48,
        83,
        72,
        92,
        111,
        227,
        133,
        142
      ]
    },
    {
      "name": "memberSlashed",
      "discriminator": [
        124,
        72,
        4,
        248,
        87,
        145,
        200,
        136
      ]
    },
    {
      "name": "payoutClaimed",
      "discriminator": [
        200,
        39,
        105,
        112,
        116,
        63,
        58,
        149
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidCircleConfig",
      "msg": "Invalid circle configuration"
    },
    {
      "code": 6001,
      "name": "circleNotFilling",
      "msg": "Circle is not in Filling state"
    },
    {
      "code": 6002,
      "name": "circleFull",
      "msg": "Circle is already full"
    },
    {
      "code": 6003,
      "name": "startDeadlinePassed",
      "msg": "Start deadline has passed"
    },
    {
      "code": 6004,
      "name": "startDeadlineNotPassed",
      "msg": "Start deadline has not yet passed"
    },
    {
      "code": 6005,
      "name": "historyNotClean",
      "msg": "Member has a default history; this circle requires clean history"
    },
    {
      "code": 6006,
      "name": "circleNotActive",
      "msg": "Circle is not in Active state"
    },
    {
      "code": 6007,
      "name": "memberNotActive",
      "msg": "Member is not in Active state"
    },
    {
      "code": 6008,
      "name": "alreadyContributed",
      "msg": "Member has already contributed in this round"
    },
    {
      "code": 6009,
      "name": "invalidRound",
      "msg": "Invalid round number"
    },
    {
      "code": 6010,
      "name": "roundNotStarted",
      "msg": "Round has not started yet"
    },
    {
      "code": 6011,
      "name": "contributionWindowClosed",
      "msg": "Contribution window has closed for this round"
    },
    {
      "code": 6012,
      "name": "potAlreadyClaimed",
      "msg": "This round's pot has already been claimed"
    },
    {
      "code": 6013,
      "name": "claimTooEarly",
      "msg": "Cannot claim yet: window has not closed and pot is not full"
    },
    {
      "code": 6014,
      "name": "recipientMismatch",
      "msg": "Recipient does not match the scheduled position for this round"
    },
    {
      "code": 6015,
      "name": "recipientNotEligible",
      "msg": "Recipient has missed a contribution and is not eligible to claim"
    },
    {
      "code": 6016,
      "name": "memberNotSlashable",
      "msg": "Member is not slashable: they have contributed in the specified round"
    },
    {
      "code": 6017,
      "name": "gracePeriodNotExpired",
      "msg": "Grace period has not expired yet"
    },
    {
      "code": 6018,
      "name": "alreadyReceivedPayout",
      "msg": "Member has already received their payout"
    },
    {
      "code": 6019,
      "name": "payoutAvailableUseClaim",
      "msg": "Your payout round has arrived — use claim_payout instead of exit_early"
    },
    {
      "code": 6020,
      "name": "exitWindowClosed",
      "msg": "Exit window is closed: too late in the circle to exit"
    },
    {
      "code": 6021,
      "name": "circleNotComplete",
      "msg": "Circle is not in Completed or Cancelled state"
    },
    {
      "code": 6022,
      "name": "membersStillOpen",
      "msg": "Some member accounts are still open; close them first"
    },
    {
      "code": 6023,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "circle",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "docs": [
              "Seeds: [\"circle\", creator, circle_id_le]"
            ],
            "type": "pubkey"
          },
          {
            "name": "circleId",
            "type": "u64"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "ATA(circle PDA, token_mint) — stored for constraint checks."
            ],
            "type": "pubkey"
          },
          {
            "name": "contributionAmount",
            "type": "u64"
          },
          {
            "name": "roundDuration",
            "type": "i64"
          },
          {
            "name": "gracePeriod",
            "type": "i64"
          },
          {
            "name": "startDeadline",
            "type": "i64"
          },
          {
            "name": "startedAt",
            "docs": [
              "0 while Filling; set on auto-start."
            ],
            "type": "i64"
          },
          {
            "name": "exitPenaltyBps",
            "type": "u16"
          },
          {
            "name": "collateralBps",
            "docs": [
              "Fraction of residual obligation required as collateral (scaled by 10_000)."
            ],
            "type": "u16"
          },
          {
            "name": "maxMembers",
            "type": "u8"
          },
          {
            "name": "memberCount",
            "type": "u8"
          },
          {
            "name": "activeMembers",
            "type": "u8"
          },
          {
            "name": "openMemberAccounts",
            "docs": [
              "Number of Member PDAs still open; gate for close_circle."
            ],
            "type": "u8"
          },
          {
            "name": "totalRounds",
            "docs": [
              "Decremented on exit_early / slash of non-recipient."
            ],
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "circleStatus"
              }
            }
          },
          {
            "name": "requireCleanHistory",
            "type": "bool"
          },
          {
            "name": "occupiedPositions",
            "docs": [
              "Bitmask of occupied payout positions (bit i = position i+1 is taken).",
              "`leave` frees the bit; `join` takes the lowest free bit."
            ],
            "type": "u16"
          },
          {
            "name": "removedPositions",
            "docs": [
              "Bitmask of positions removed from the schedule (exit_early / slash)."
            ],
            "type": "u16"
          },
          {
            "name": "claimedRounds",
            "docs": [
              "Bitmask of rounds whose pots have been claimed."
            ],
            "type": "u16"
          },
          {
            "name": "contributionCounts",
            "docs": [
              "contribution_counts[r] = number of contributions received for round r+1."
            ],
            "type": {
              "array": [
                "u8",
                16
              ]
            }
          },
          {
            "name": "potBonus",
            "docs": [
              "Slash compensation / forfeits credited to each round's pot."
            ],
            "type": {
              "array": [
                "u64",
                16
              ]
            }
          },
          {
            "name": "surchargeAccrued",
            "docs": [
              "Cumulative per-member surcharge accrued from all exit_early calls so far."
            ],
            "type": "u64"
          },
          {
            "name": "refundReserve",
            "docs": [
              "Tokens collected into the refund reserve from surcharges and slash coverage."
            ],
            "type": "u64"
          },
          {
            "name": "totalCollateral",
            "docs": [
              "Sum of all collateral currently held in the vault."
            ],
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "circleCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "circleClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "circleCompleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "circleCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "contributionAmount",
            "type": "u64"
          },
          {
            "name": "maxMembers",
            "type": "u8"
          },
          {
            "name": "roundDuration",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "circleStarted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "startedAt",
            "type": "i64"
          },
          {
            "name": "totalRounds",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "circleStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "filling"
          },
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "contributionMade",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "round",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "docs": [
              "Seeds: [\"member\", circle, user]"
            ],
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "position",
            "docs": [
              "Original (immutable) payout position, 1-based."
            ],
            "type": "u8"
          },
          {
            "name": "collateral",
            "docs": [
              "Collateral deposited (set to 0 after slash)."
            ],
            "type": "u64"
          },
          {
            "name": "contributions",
            "docs": [
              "Bitmask of rounds in which this member has contributed."
            ],
            "type": "u16"
          },
          {
            "name": "surchargePaid",
            "docs": [
              "Cumulative surcharge already paid by this member."
            ],
            "type": "u64"
          },
          {
            "name": "refundDue",
            "docs": [
              "Amount owed back to this member upon circle completion (Exited only)."
            ],
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "memberStatus"
              }
            }
          },
          {
            "name": "hasReceivedPayout",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "memberClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "collateralReturned",
            "type": "u64"
          },
          {
            "name": "refundReturned",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "memberExited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "refundDue",
            "type": "u64"
          },
          {
            "name": "surchargePerMember",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "memberHistory",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "docs": [
              "Seeds: [\"history\", user]  — NEVER closed."
            ],
            "type": "pubkey"
          },
          {
            "name": "defaults",
            "docs": [
              "Incremented on slash (or forfeiture detected at close_member)."
            ],
            "type": "u16"
          },
          {
            "name": "completed",
            "docs": [
              "Incremented when a member closes with a full contribution record."
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "memberJoined",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "u8"
          },
          {
            "name": "collateral",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "memberLeft",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "collateralReturned",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "memberSlashed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "missedRound",
            "type": "u8"
          },
          {
            "name": "collateralSlashed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "memberStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "exited"
          },
          {
            "name": "defaulted"
          },
          {
            "name": "completed"
          }
        ]
      }
    },
    {
      "name": "payoutClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "circle",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          },
          {
            "name": "round",
            "type": "u8"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
