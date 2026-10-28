# Online demo — deployment receipt

Published 2026-10-28: **https://tesla-bms-studio-daniil.daniilk.chatgpt.site/**

Audience: **public**, explicitly selected by the owner; platform access policy revision 2. Unauthenticated HTTPS returned 200 for the dashboard and its synthetic runtime, with no sign-in redirect.

## Current publication — version 3

- Published 2026-10-28, same public URL and audience.
- Saved version: `appgprj_6ae24dac714881918ac12a6bb13e3f90~appgver_0396e3ad80f4819180dea27b7a0a1bd2`.
- Successful deployment: `appgdep_6ae25caae0e48191be8b7516f51c5320`.
- Site source commit: `95cdc53ca86d1f72ed01486a9a41be089d2a80e7`.
- Application build source: `de76b8641c337f7c921ddcc5e8df1611553380ed`.
- HTTPS `BUILD.json` read-back reports version 0.3, hardware access false. Anonymous deployed-browser checks passed across all four tabs, demo CAC, VSH CSV roundtrip, Ah download, apparent-resistance regression and mobile layout/hints.
- No physical measurements, user screenshot or private source conversation were published. VSH fixtures are synthetic; live VSH remains unavailable.

## Previous publication — version 2

- Site project: `appgprj_6ae24dac714881918ac12a6bb13e3f90`.
- Saved/deployed version (version 2): `appgprj_6ae24dac714881918ac12a6bb13e3f90~appgver_9bd856a4ed4881919af174a4710067bf`.
- Successful deployment: `appgdep_6ae2545ecf108191852899a32bdbbb32`.
- Site source commit: `161875b577a6b0cb3c66968258bbc892e0ef39aa`.
- Application source used for the build: GitHub commit `ec83370807d99607c4906e76ff10c1754e03789d`.

The Sites source repository is separate from the application's GitHub repository. Its `.openai/hosting.json` owns the Site identity. To update, reuse the project ID above, open its bound source via the Sites workflow, and generate `dist/` with `python scripts/build_demo.py <site-checkout>/dist`. Package/push that exact source state with the Sites helper and deploy using the current public audience. Do not create another Site or push the application repository to the Sites source remote.

The live bundle includes only shared UI, synthetic demo code and profile metadata. It has no CAN backend, credentials, real battery captures or private pasted conversation. CSV import and analysis execute in the visitor's browser. Publishing the demo does not create remote access to physical PCAN hardware.
