import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';

export function AboutPage() {
	useDocumentTitle('About');

	return (
		<div className="page-reveal flex min-h-[calc(100vh-7rem)] items-center justify-center px-2 py-8 sm:px-6">
			<section
				aria-labelledby="about-title"
				className="relative isolate flex w-full max-w-4xl flex-col items-center overflow-hidden rounded-2xl border border-teal-200/60 bg-white/85 px-5 py-10 text-center shadow-[0_24px_80px_rgba(13,148,136,0.08)] backdrop-blur-xl sm:px-10 sm:py-14 dark:border-teal-900/60 dark:bg-slate-950/80 dark:shadow-[0_28px_100px_rgba(0,0,0,0.4)]">
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(13,148,136,0.14),transparent_36%),radial-gradient(circle_at_76%_30%,rgba(245,158,11,0.12),transparent_32%),linear-gradient(135deg,rgba(13,148,136,0.06),transparent_42%)]"
				/>
				<div
					aria-hidden="true"
					className="absolute inset-x-8 top-8 -z-10 h-36 rounded-full bg-teal-400/12 blur-3xl dark:bg-teal-400/10"
				/>
				<div className="relative">
					<div
						aria-hidden="true"
						className="absolute inset-8 rounded-full bg-amber-400/18 blur-2xl"
					/>
					<img
						alt="aidd"
						className="relative h-48 w-48 rounded-[2rem] object-cover shadow-[0_18px_60px_rgba(13,148,136,0.22)] ring-1 ring-white/70 sm:h-64 sm:w-64 dark:shadow-[0_18px_70px_rgba(45,212,191,0.18)] dark:ring-teal-300/20"
						decoding="async"
						height="512"
						src="/web-app-manifest-512x512.png"
						width="512"
					/>
				</div>
				<div className="mt-8 grid gap-3">
					<p
						className="font-display text-foreground text-5xl font-semibold sm:text-7xl"
						id="about-title"
						translate="no">
						aidd
					</p>
					<p className="text-base font-medium text-teal-800 sm:text-lg dark:text-teal-200">
						AI Development Director
					</p>
					<p className="text-muted-foreground font-mono text-xs uppercase">
						Version {__AIDD_VERSION__}
					</p>
				</div>
			</section>
		</div>
	);
}
