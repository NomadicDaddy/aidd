import { Component, type ErrorInfo, type ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';

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

	private handleReload = () => {
		window.location.reload();
	};

	override render() {
		const { error } = this.state;
		if (!error) {
			return this.props.children;
		}
		return (
			<div className="p-6">
				<Card className="mx-auto max-w-lg" variant="panel">
					<h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						This page hit an unexpected error and could not be displayed. The rest of
						the app is still usable — try another page from the sidebar, or reload.
					</p>
					<pre
						className={cn(
							'mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs',
							toneText.red,
						)}>
						{error.message}
					</pre>
					<div className="mt-4">
						<Button onClick={this.handleReload} variant="primary">
							Reload page
						</Button>
					</div>
				</Card>
			</div>
		);
	}
}
