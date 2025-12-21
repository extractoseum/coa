# SWIS Watch - Checklist para PRs

## Antes de crear PR

- [ ] ¿Agregaste `data-testid` a elementos nuevos interactivos?
- [ ] ¿Registraste los testIds en `uiMap.ts`?
- [ ] ¿Tu nueva página tiene `<Screen id="...">`?
- [ ] ¿Usaste `ROUTES.*` en lugar de strings hardcodeados?
- [ ] ¿Usaste `to.*()` para rutas dinámicas?

## Antes de merge

- [ ] `npm run lint` pasa
- [ ] `node scripts/validate-uimap.js` pasa
- [ ] Tests E2E pasan (`npx playwright test`)

## Si modificaste rutas

- [ ] ¿Actualizaste `routes.ts`?
- [ ] ¿El `routeManifest.json` se regeneró?
- [ ] ¿Actualizaste tests E2E si aplica?

## Si agregaste errores

- [ ] ¿Usaste código `E_*` de `ERROR_CODES`?
- [ ] ¿O agregaste uno nuevo al enum?
