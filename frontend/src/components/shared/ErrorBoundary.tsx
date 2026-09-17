import { Component, type ErrorInfo, lazy, type ReactNode, Suspense } from 'react';

const RenderError = lazy(() =>
	import('./RenderError.tsx')
		.then((module) => ({ default: module.RenderError }))
		.catch(() => ({ default: ReloadError })),
);

// Keep recovery available even if the original error was a failed chunk request.
function ReloadError() {
	return (
		<p className="p-6" role="alert">
			Something went wrong.{' '}
			<a className="inline-flex min-h-11 min-w-11 items-center underline" href="">
				Reload page
			</a>
		</p>
	);
}

interface ErrorBoundaryProps {
	children: ReactNode;
	resetKey?: string;
}

interface ErrorBoundaryState {
	error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	override state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	override componentDidUpdate(prevProps: ErrorBoundaryProps) {
		if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
			this.setState({ error: null });
		}
	}

	override componentDidCatch(error: Error, info: ErrorInfo) {
		console.error('Unhandled render error:', error, info.componentStack);
	}

	override render() {
		const { error } = this.state;
		if (!error) {
			return this.props.children;
		}
		return (
			<Suspense fallback={<ReloadError />}>
				<RenderError error={error} />
			</Suspense>
		);
	}
}
