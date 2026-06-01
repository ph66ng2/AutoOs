# Learnings - T14: Migrate alert() in Servicos.tsx

## Pattern: useServicos error type
- `useServicos` returns `error` as `string | null` (not a union with object)
- So `error?.message` doesn't work — just use `error` directly
- Plan template assumed `typeof error === 'string' ? error : error?.message` but this fails TS narrowing when error is `string | null`

## Pattern: useNotification destructuring
- Only destructure what you need: `const { error: showError } = useNotification()`
- Unused variables cause TS6133 errors
