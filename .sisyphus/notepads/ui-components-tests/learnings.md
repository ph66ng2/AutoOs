## T19: UI Components Test Creation

### Vitest conventions in this project:
- Import `describe, it, expect, vi` from `vitest` explicitly (even though globals: true)
- Portuguese test descriptions (following button.test.tsx convention)
- `@testing-library/react` for rendering + `fireEvent`
- `@testing-library/user-event` for realistic user interactions
- `@testing-library/jest-dom/vitest` setup provides matchers like `.toBeInTheDocument()`, `.toHaveClass()`

### Key patterns:

**Mocking modules**: Use `vi.mock('@/lib/error-utils', () => ({...}))` before describe block.

**fakeTimers + userEvent conflict**: `vi.useFakeTimers()` + `userEvent.setup()` causes timeouts because userEvent internally uses async timers. Solution: use `fireEvent` + `act(async () => { await Promise.resolve() })` to flush microtasks when combining with fake timers.

**Radix AlertDialog in tests**: Renders content via portal, but `@testing-library/react`'s `screen` queries work against `document.body`, so no special handling needed.

**ErrorBoundary testing**: Use a helper component that throws on demand. Suppress console.error spam with `vi.spyOn(console, 'error').mockImplementation(() => {})`. Mock `navigator.clipboard` and `window.location` at module level.

**Dialog re-render tests**: Use `rerender` from `render()` to simulate dialog open/close cycles. Radix warns about missing `AlertDialogDescription` when description prop is absent (stderr, but test passes).

### Dependency added:
- `@testing-library/user-event` (devDependency) — needed for `.type()`, `.click()`, `.keyboard()` interactions
