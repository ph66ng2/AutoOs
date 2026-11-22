# PowerSync: referência para Mobile Field futuro

PowerSync **não faz parte do AutoOS desktop interno nem do SaaS Online desktop**. A configuração de staging descrita no [plano antigo](_archive/POWERSYNC_STAGING_DESKTOP_OLD.md) foi concebida para um plano Offline no Tauri e não é um roteiro ativo de execução.

O PR [Configurar Sync Streams tenant-safe](https://github.com/ph66ng2/AutoOs/pull/99) foi fechado sem merge: faltavam emissor de token, conexão da instância Cloud e validação A/B em staging. Nenhuma stream persistente deve ser presumida como pronta. O ticket `AO-PS-005` está classificado como substituído no roadmap.

Quando Mobile Field entrar em planejamento, abrir tickets próprios para contrato de dados, autenticação por empresa, streams, escrita offline, conflitos e operação de staging. Usar somente dados sintéticos e aprovação humana antes de qualquer configuração persistente.
