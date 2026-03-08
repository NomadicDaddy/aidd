---
title: 'React Composition Patterns Audit (Vercel)'
last_updated: '2026-03-06'
version: '1.0'
category: 'Frontend'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Monthly'
lifecycle: 'pre-release'
---

# React Composition Patterns Audit

Based on [Vercel's React Composition Patterns skill](https://github.com/vercel-labs/agent-skills). Companion audit to [REACT_BEST_PRACTICES.md](./REACT_BEST_PRACTICES.md).

Composition patterns for building flexible, maintainable React components. Covers 8 rules across 4 categories — component architecture, state management, implementation patterns, and React 19 APIs.

## Executive Summary

**Target Audience**: Component library authors, feature developers building reusable UI

**Core Principle**: Avoid boolean prop proliferation by using compound components, lifting state into providers, and composing internals. These patterns make codebases easier to maintain and extend.

**Key Priorities**

- **Eliminate boolean props**: Each boolean doubles possible states, creating exponential complexity
- **Use compound components**: Shared context, explicit composition, no prop drilling
- **Decouple state from UI**: Providers own state; UI consumes a generic interface
- **Prefer children over render props**: Cleaner composition, better readability

**Impact Levels**

- **HIGH**: Component architecture (boolean props, compound components)
- **MEDIUM**: State management, implementation patterns, React 19 APIs

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Spernakit Applicability

This audit fully applies to spernakit applications (React 19 + Vite). All 8 rules are relevant.

### Context vs Zustand Clarification

Spernakit rules state: "Zustand stores for client state (NOT React Context for state)". This refers to **global/app-level state** (auth, theme, sidebar, workspace). The composition patterns in this audit use React Context for **local compound component state** — a different use case that is fully compatible with spernakit's architecture.

| Use Case                                  | Correct Approach                                |
| ----------------------------------------- | ----------------------------------------------- |
| Global app state (auth, theme, workspace) | Zustand store with persist                      |
| Server state (API data)                   | TanStack Query                                  |
| Local compound component state            | React Context via provider pattern (this audit) |
| Form state within a compound component    | Context provider wrapping composed children     |

### React 19 Alignment

Spernakit uses React 19 with React Compiler enabled. All React 19 patterns in this audit (ref as prop, `use()` instead of `useContext()`) are the correct approach.

## Table of Contents

1. [Component Architecture](#1-component-architecture) — **HIGH**
2. [State Management](#2-state-management) — **MEDIUM**
3. [Implementation Patterns](#3-implementation-patterns) — **MEDIUM**
4. [React 19 APIs](#4-react-19-apis) — **MEDIUM**

---

## 1. Component Architecture

**Impact: HIGH**

Fundamental patterns for structuring components to avoid prop proliferation and enable flexible composition.

### 1.1 Avoid Boolean Prop Proliferation

**Impact: CRITICAL** (prevents unmaintainable component variants)

> **Skill rule**: `architecture-avoid-boolean-props`

Don't add boolean props like `isThread`, `isEditing`, `isDMThread` to customize component behavior. Each boolean doubles possible states and creates unmaintainable conditional logic. Use composition instead.

**Warning signs**: A component accepts 3+ boolean props that control rendering behavior, or has nested ternaries/conditionals driven by prop flags.

Incorrect (boolean props create exponential complexity):

```tsx
function Composer({
	onSubmit,
	isThread,
	channelId,
	isDMThread,
	dmId,
	isEditing,
	isForwarding,
}: Props) {
	return (
		<form>
			<Header />
			<Input />
			{isDMThread ? (
				<AlsoSendToDMField id={dmId} />
			) : isThread ? (
				<AlsoSendToChannelField id={channelId} />
			) : null}
			{isEditing ? <EditActions /> : isForwarding ? <ForwardActions /> : <DefaultActions />}
			<Footer onSubmit={onSubmit} />
		</form>
	);
}
```

Correct (composition eliminates conditionals):

```tsx
function ChannelComposer() {
	return (
		<Composer.Frame>
			<Composer.Header />
			<Composer.Input />
			<Composer.Footer>
				<Composer.Attachments />
				<Composer.Formatting />
				<Composer.Emojis />
				<Composer.Submit />
			</Composer.Footer>
		</Composer.Frame>
	);
}

function ThreadComposer({ channelId }: { channelId: string }) {
	return (
		<Composer.Frame>
			<Composer.Header />
			<Composer.Input />
			<AlsoSendToChannelField id={channelId} />
			<Composer.Footer>
				<Composer.Formatting />
				<Composer.Emojis />
				<Composer.Submit />
			</Composer.Footer>
		</Composer.Frame>
	);
}

function EditComposer() {
	return (
		<Composer.Frame>
			<Composer.Input />
			<Composer.Footer>
				<Composer.Formatting />
				<Composer.Emojis />
				<Composer.CancelEdit />
				<Composer.SaveEdit />
			</Composer.Footer>
		</Composer.Frame>
	);
}
```

Each variant is explicit about what it renders. Shared internals without a monolithic parent.

### 1.2 Use Compound Components

**Impact: HIGH** (enables flexible composition without prop drilling)

> **Skill rule**: `architecture-compound-components`

Structure complex components as compound components with a shared context. Each subcomponent accesses shared state via context, not props. Consumers compose the pieces they need.

Incorrect (monolithic component with render props and boolean flags):

```tsx
function Composer({
	renderHeader,
	renderFooter,
	renderActions,
	showAttachments,
	showFormatting,
	showEmojis,
}: Props) {
	return (
		<form>
			{renderHeader?.()}
			<Input />
			{showAttachments && <Attachments />}
			{renderFooter ? (
				renderFooter()
			) : (
				<Footer>
					{showFormatting && <Formatting />}
					{showEmojis && <Emojis />}
					{renderActions?.()}
				</Footer>
			)}
		</form>
	);
}
```

Correct (compound components with shared context):

```tsx
const ComposerContext = createContext<ComposerContextValue | null>(null);

function ComposerProvider({ children, state, actions, meta }: ProviderProps) {
	return <ComposerContext value={{ state, actions, meta }}>{children}</ComposerContext>;
}

function ComposerFrame({ children }: { children: React.ReactNode }) {
	return <form>{children}</form>;
}

function ComposerInput() {
	const {
		state,
		actions: { update },
		meta: { inputRef },
	} = use(ComposerContext);
	return (
		<TextInput
			ref={inputRef}
			value={state.input}
			onChangeText={(text) => update((s) => ({ ...s, input: text }))}
		/>
	);
}

function ComposerSubmit() {
	const {
		actions: { submit },
	} = use(ComposerContext);
	return <Button onPress={submit}>Send</Button>;
}

// Export as compound component
const Composer = {
	Provider: ComposerProvider,
	Frame: ComposerFrame,
	Input: ComposerInput,
	Submit: ComposerSubmit,
	Header: ComposerHeader,
	Footer: ComposerFooter,
};
```

Usage:

```tsx
<Composer.Provider state={state} actions={actions} meta={meta}>
	<Composer.Frame>
		<Composer.Header />
		<Composer.Input />
		<Composer.Footer>
			<Composer.Formatting />
			<Composer.Submit />
		</Composer.Footer>
	</Composer.Frame>
</Composer.Provider>
```

Consumers explicitly compose what they need. No hidden conditionals. State, actions, and meta are dependency-injected by a parent provider.

---

## 2. State Management

**Impact: MEDIUM**

Patterns for lifting state and managing shared context across composed components.

### 2.1 Decouple State Management from UI

**Impact: MEDIUM** (enables swapping state implementations without changing UI)

> **Skill rule**: `state-decouple-implementation`

The provider component should be the only place that knows how state is managed. UI components consume the context interface — they don't know if state comes from useState, Zustand, or a server sync.

Incorrect (UI coupled to state implementation):

```tsx
function ChannelComposer({ channelId }: { channelId: string }) {
	// UI component knows about global state implementation
	const state = useGlobalChannelState(channelId);
	const { submit, updateInput } = useChannelSync(channelId);

	return (
		<Composer.Frame>
			<Composer.Input value={state.input} onChange={(text) => updateInput(text)} />
			<Composer.Submit onPress={() => submit()} />
		</Composer.Frame>
	);
}
```

Correct (state management isolated in provider):

```tsx
// Provider handles all state management details
function ChannelProvider({
	channelId,
	children,
}: {
	channelId: string;
	children: React.ReactNode;
}) {
	const { state, update, submit } = useGlobalChannel(channelId);
	const inputRef = useRef(null);

	return (
		<Composer.Provider state={state} actions={{ update, submit }} meta={{ inputRef }}>
			{children}
		</Composer.Provider>
	);
}

// UI component only knows about the context interface
function ChannelComposer() {
	return (
		<Composer.Frame>
			<Composer.Header />
			<Composer.Input />
			<Composer.Footer>
				<Composer.Submit />
			</Composer.Footer>
		</Composer.Frame>
	);
}

// Usage
function Channel({ channelId }: { channelId: string }) {
	return (
		<ChannelProvider channelId={channelId}>
			<ChannelComposer />
		</ChannelProvider>
	);
}
```

Different providers, same UI — swap the provider, keep the UI.

### 2.2 Define Generic Context Interfaces

**Impact: HIGH** (enables dependency-injectable state across use-cases)

> **Skill rule**: `state-context-interface`

Define a generic interface for your component context with three parts: `state`, `actions`, and `meta`. This interface is a contract that any provider can implement — enabling the same UI components to work with completely different state implementations.

Correct (generic interface enables dependency injection):

```tsx
// Define a GENERIC interface that any provider can implement
interface ComposerState {
	input: string;
	attachments: Attachment[];
	isSubmitting: boolean;
}

interface ComposerActions {
	update: (updater: (state: ComposerState) => ComposerState) => void;
	submit: () => void;
}

interface ComposerMeta {
	inputRef: React.RefObject<TextInput>;
}

interface ComposerContextValue {
	state: ComposerState;
	actions: ComposerActions;
	meta: ComposerMeta;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);
```

UI components consume the interface, not the implementation:

```tsx
function ComposerInput() {
	const {
		state,
		actions: { update },
		meta,
	} = use(ComposerContext);

	// Works with ANY provider that implements the interface
	return (
		<TextInput
			ref={meta.inputRef}
			value={state.input}
			onChangeText={(text) => update((s) => ({ ...s, input: text }))}
		/>
	);
}
```

Different providers implement the same interface:

```tsx
// Provider A: Local state for ephemeral forms
function ForwardMessageProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState(initialState);
	const inputRef = useRef(null);
	const submit = useForwardMessage();

	return (
		<ComposerContext
			value={{
				state,
				actions: { update: setState, submit },
				meta: { inputRef },
			}}>
			{children}
		</ComposerContext>
	);
}

// Provider B: Global synced state for channels
function ChannelProvider({ channelId, children }: Props) {
	const { state, update, submit } = useGlobalChannel(channelId);
	const inputRef = useRef(null);

	return (
		<ComposerContext
			value={{
				state,
				actions: { update, submit },
				meta: { inputRef },
			}}>
			{children}
		</ComposerContext>
	);
}
```

The provider boundary is what matters — not the visual nesting. Components that need shared state just need to be within the provider, not inside the visual frame.

### 2.3 Lift State into Provider Components

**Impact: HIGH** (enables state sharing outside component boundaries)

> **Skill rule**: `state-lift-state`

Move state management into dedicated provider components. This allows sibling components outside the main UI to access and modify state without prop drilling or awkward refs.

Incorrect (state trapped inside component):

```tsx
function ForwardMessageComposer() {
	const [state, setState] = useState(initialState);
	const forwardMessage = useForwardMessage();

	return (
		<Composer.Frame>
			<Composer.Input />
			<Composer.Footer />
		</Composer.Frame>
	);
}

// Problem: How does this button access composer state?
function ForwardMessageDialog() {
	return (
		<Dialog>
			<ForwardMessageComposer />
			<MessagePreview /> {/* Needs composer state */}
			<DialogActions>
				<ForwardButton /> {/* Needs to call submit */}
			</DialogActions>
		</Dialog>
	);
}
```

Also incorrect: syncing state up via useEffect callbacks, or reading state from a ref on submit. Both are fragile workarounds for state that should be lifted.

Correct (state lifted to provider):

```tsx
function ForwardMessageProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState(initialState);
	const forwardMessage = useForwardMessage();
	const inputRef = useRef(null);

	return (
		<Composer.Provider
			state={state}
			actions={{ update: setState, submit: forwardMessage }}
			meta={{ inputRef }}>
			{children}
		</Composer.Provider>
	);
}

function ForwardMessageDialog() {
	return (
		<ForwardMessageProvider>
			<Dialog>
				<ForwardMessageComposer />
				<MessagePreview /> {/* Reads state from context */}
				<DialogActions>
					<CancelButton />
					<ForwardButton /> {/* Calls submit from context */}
				</DialogActions>
			</Dialog>
		</ForwardMessageProvider>
	);
}

function ForwardButton() {
	const { actions } = use(Composer.Context);
	return <Button onPress={actions.submit}>Forward</Button>;
}
```

**Key insight**: Components that need shared state don't have to be visually nested inside each other — they just need to be within the same provider.

---

## 3. Implementation Patterns

**Impact: MEDIUM**

Specific techniques for implementing compound components and context providers.

### 3.1 Create Explicit Component Variants

**Impact: MEDIUM** (self-documenting code, no hidden conditionals)

> **Skill rule**: `patterns-explicit-variants`

Instead of one component with many boolean props, create explicit variant components. Each variant composes the pieces it needs. The code documents itself.

Incorrect (one component, many modes):

```tsx
// What does this component actually render?
<Composer isThread isEditing={false} channelId="abc" showAttachments showFormatting={false} />
```

Correct (explicit variants):

```tsx
// Immediately clear what this renders
<ThreadComposer channelId="abc" />

// Or
<EditMessageComposer messageId="xyz" />

// Or
<ForwardMessageComposer messageId="123" />
```

Each variant is explicit about:

- What provider/state it uses
- What UI elements it includes
- What actions are available

No boolean prop combinations to reason about. No impossible states.

### 3.2 Prefer Children Over Render Props

**Impact: MEDIUM** (cleaner composition, better readability)

> **Skill rule**: `patterns-children-over-render-props`

Use `children` for composition instead of `renderX` props. Children are more readable, compose naturally, and don't require understanding callback signatures.

Incorrect (render props):

```tsx
function Composer({
	renderHeader,
	renderFooter,
	renderActions,
}: {
	renderHeader?: () => React.ReactNode;
	renderFooter?: () => React.ReactNode;
	renderActions?: () => React.ReactNode;
}) {
	return (
		<form>
			{renderHeader?.()}
			<Input />
			{renderFooter ? renderFooter() : <DefaultFooter />}
			{renderActions?.()}
		</form>
	);
}

// Usage is awkward and inflexible
<Composer
	renderHeader={() => <CustomHeader />}
	renderFooter={() => (
		<>
			<Formatting />
			<Emojis />
		</>
	)}
	renderActions={() => <SubmitButton />}
/>;
```

Correct (compound components with children):

```tsx
function ComposerFrame({ children }: { children: React.ReactNode }) {
	return <form>{children}</form>;
}

function ComposerFooter({ children }: { children: React.ReactNode }) {
	return <footer className="flex">{children}</footer>;
}

// Usage is flexible and readable
<Composer.Frame>
	<CustomHeader />
	<Composer.Input />
	<Composer.Footer>
		<Composer.Formatting />
		<Composer.Emojis />
		<SubmitButton />
	</Composer.Footer>
</Composer.Frame>;
```

**When render props are still appropriate**: When the parent needs to pass data back to the child (e.g., list item renderers with index/item data).

```tsx
<List data={items} renderItem={({ item, index }) => <Item item={item} index={index} />} />
```

---

## 4. React 19 APIs

**Impact: MEDIUM**

React 19 API changes that affect composition patterns.

> Spernakit uses React 19. These patterns are the **required** approach, not optional.

### 4.1 React 19 API Changes

**Impact: MEDIUM** (cleaner component definitions and context usage)

> **Skill rule**: `react19-no-forwardref`

In React 19, `ref` is a regular prop (no `forwardRef` wrapper needed), and `use()` replaces `useContext()`.

**ref as a prop** — Incorrect (forwardRef in React 19):

```tsx
const ComposerInput = forwardRef<TextInput, Props>((props, ref) => {
	return <TextInput ref={ref} {...props} />;
});
```

Correct (ref as a regular prop):

```tsx
function ComposerInput({ ref, ...props }: Props & { ref?: React.Ref<TextInput> }) {
	return <TextInput ref={ref} {...props} />;
}
```

**use() instead of useContext()** — Incorrect:

```tsx
const value = useContext(MyContext);
```

Correct:

```tsx
const value = use(MyContext);
```

`use()` can also be called conditionally, unlike `useContext()`:

```tsx
function MaybeComposerInput({ standalone }: { standalone?: boolean }) {
	if (standalone) return <TextInput />;

	// use() works inside conditionals
	const { state } = use(ComposerContext);
	return <TextInput value={state.input} />;
}
```

---

## Audit Checklist

### High Priority Issues

**Component Architecture**

- [ ] **High**: No components with 3+ boolean props controlling render behavior
- [ ] **High**: Complex reusable components structured as compound components with shared context
- [ ] **High**: No monolithic components with nested ternaries driven by prop flags
- [ ] **High**: Each component variant is an explicit, named component (not a boolean mode)

### Medium Priority Issues

**State Management**

- [ ] **Medium**: Provider is the only place that knows state implementation details
- [ ] **Medium**: UI components consume context interface, not specific hooks/stores
- [ ] **Medium**: Context interfaces follow `{ state, actions, meta }` pattern
- [ ] **Medium**: State lifted into providers when siblings need shared access
- [ ] **Medium**: No useEffect callbacks or refs used to sync state between siblings

**Implementation Patterns**

- [ ] **Medium**: Children used for composition instead of `renderX` props (unless data passback needed)
- [ ] **Medium**: Render props only used when parent provides data to child
- [ ] **Medium**: Variant components are self-documenting (clear what they render)

**React 19 APIs**

- [ ] **Medium**: No `forwardRef` usage — `ref` passed as regular prop
- [ ] **Medium**: `use()` used instead of `useContext()` for context consumption
- [ ] **Medium**: No unnecessary `useContext` imports from React

---

## Report Template

````markdown
# Composition Patterns Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Score**: [Score]/100
**High Priority Issues Found**: [Number]
**Medium Priority Issues Found**: [Number]

**Composition Health Summary**:

- Boolean prop proliferation: [None/Minor/Major]
- Compound component adoption: [Score]/25
- State management decoupling: [Score]/25
- React 19 API compliance: [Score]/25

## Category Breakdown

### 1. Component Architecture (HIGH)

**Score**: [Score]/30
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 2. State Management (MEDIUM)

**Score**: [Score]/30
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 3. Implementation Patterns (MEDIUM)

**Score**: [Score]/20
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 4. React 19 APIs (MEDIUM)

**Score**: [Score]/20
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

## Detailed Findings

### High Priority Issues

#### Issue #1: [Title]

- **Severity**: High
- **Category**: [Architecture/State/Patterns/React19]
- **Impact**: [Description]
- **Location**: `path/to/file.tsx:line`
- **Code**:
    ```tsx
    // Current code
    ```
- **Fix**:
    ```tsx
    // Corrected code
    ```
- **Effort Estimate**: [Hours/Days]

### Medium Priority Issues

[Similar format]

## Recommendations

### Immediate Actions (0-7 days)

1. **[Refactor boolean-heavy components]**
    - Impact: Eliminates exponential state complexity
    - Effort: [Low/Medium/High]
    - Files: [List of affected components]

### Short-term Actions (1-4 weeks)

1. **[Adopt compound component pattern]**
    - Impact: Enables flexible composition
    - Effort: [Low/Medium/High]

2. **[Lift state into providers]**
    - Impact: Enables sibling state sharing
    - Effort: [Low/Medium/High]

## Metrics

- **Boolean Prop Count**: [Current] components with 3+ boolean props
- **Compound Components**: [Count] compound component groups
- **forwardRef Usage**: [Count] remaining forwardRef instances
- **useContext vs use()**: [Count] remaining useContext calls

## Next Audit Date

Recommended: [Date] (Monthly for active development)

---

**Auditor**: [Name]
**Date**: [Date]
**React Compiler Enabled**: [Yes/No]
````

## References

- [Vercel Composition Patterns Skill](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns)
- [React Documentation — Context](https://react.dev/learn/passing-data-deeply-with-context)
- [React Documentation — use()](https://react.dev/reference/react/use)
- [React Documentation — Compound Components](https://react.dev/learn/extracting-state-logic-into-a-reducer)

---

**Version**: 1.0
**Last Updated**: 2026-03-06
**Next Review**: 2026-04-06

```

```
