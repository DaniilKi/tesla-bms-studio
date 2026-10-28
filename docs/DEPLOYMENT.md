# Online demo — deployment receipt

Published 2026-10-28: **https://tesla-bms-studio-daniil.daniilk.chatgpt.site/**

Audience: **public**, explicitly selected by the owner; platform access policy revision 2. Unauthenticated HTTPS returned 200 for the dashboard and its synthetic runtime, with no sign-in redirect.

- Site project: `appgprj_6ae24dac714881918ac12a6bb13e3f90`.
- Saved/deployed version: `appgprj_6ae24dac714881918ac12a6bb13e3f90~appgver_9c004d8643388191ac1d11678a0aacb4`.
- Successful deployment: `appgdep_6ae251868de08191b7bc451f3754711b`.
- Site source commit: `5fd1819f4f59220124333ddcd4c9b2a4c6405a41`.
- Application source used for the build: GitHub commit `02a35387b5147e52ead29b41dacb1bb815ea2797`.

The Sites source repository is separate from the application's GitHub repository. Its `.openai/hosting.json` owns the Site identity. To update, reuse the project ID above, open its bound source via the Sites workflow, and generate `dist/` with `python scripts/build_demo.py <site-checkout>/dist`. Package/push that exact source state with the Sites helper and deploy using the current public audience. Do not create another Site or push the application repository to the Sites source remote.

The live bundle includes only shared UI, synthetic demo code and profile metadata. It has no CAN backend, credentials, real battery captures or private pasted conversation. CSV import and analysis execute in the visitor's browser. Publishing the demo does not create remote access to physical PCAN hardware.
