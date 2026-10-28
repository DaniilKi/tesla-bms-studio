# Online demo — deployment receipt

Published 2026-10-28: **https://tesla-bms-studio-daniil.daniilk.chatgpt.site/**

Audience: **public**, explicitly selected by the owner; platform access policy revision 2. Unauthenticated HTTPS returned 200 for the dashboard and its synthetic runtime, with no sign-in redirect.

- Site project: `appgprj_6ae24dac714881918ac12a6bb13e3f90`.
- Saved/deployed version (version 2): `appgprj_6ae24dac714881918ac12a6bb13e3f90~appgver_9bd856a4ed4881919af174a4710067bf`.
- Successful deployment: `appgdep_6ae2545ecf108191852899a32bdbbb32`.
- Site source commit: `161875b577a6b0cb3c66968258bbc892e0ef39aa`.
- Application source used for the build: GitHub commit `ec83370807d99607c4906e76ff10c1754e03789d`.

The Sites source repository is separate from the application's GitHub repository. Its `.openai/hosting.json` owns the Site identity. To update, reuse the project ID above, open its bound source via the Sites workflow, and generate `dist/` with `python scripts/build_demo.py <site-checkout>/dist`. Package/push that exact source state with the Sites helper and deploy using the current public audience. Do not create another Site or push the application repository to the Sites source remote.

The live bundle includes only shared UI, synthetic demo code and profile metadata. It has no CAN backend, credentials, real battery captures or private pasted conversation. CSV import and analysis execute in the visitor's browser. Publishing the demo does not create remote access to physical PCAN hardware.
