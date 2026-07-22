import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';

export function AboutPage() {
	useDocumentTitle('About');

	return (
		<div className="page-reveal flex min-h-[calc(100vh-7rem)] items-center justify-center px-2 py-8 sm:px-6">
			<section
				aria-labelledby="about-title"
				className="relative isolate flex w-full max-w-4xl flex-col items-center overflow-hidden rounded-lg border border-cyan-200/70 bg-white/82 px-5 py-10 text-center shadow-[0_24px_90px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:px-10 sm:py-14 dark:border-cyan-900/70 dark:bg-slate-950/78 dark:shadow-[0_28px_110px_rgba(0,0,0,0.46)]">
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.22),transparent_32%),radial-gradient(circle_at_76%_30%,rgba(245,158,11,0.2),transparent_30%),linear-gradient(135deg,rgba(8,145,178,0.1),transparent_42%)]"
				/>
				<div
					aria-hidden="true"
					className="absolute inset-x-8 top-8 -z-10 h-36 rounded-full bg-cyan-400/18 blur-3xl dark:bg-cyan-400/14"
				/>
				<div className="relative">
					<div
						aria-hidden="true"
						className="absolute inset-8 rounded-full bg-amber-400/22 blur-2xl"
					/>
					<img
						alt="aidd"
						className="relative h-48 w-48 rounded-[2rem] object-cover shadow-[0_18px_60px_rgba(8,145,178,0.28)] ring-1 ring-white/70 sm:h-64 sm:w-64 dark:shadow-[0_18px_70px_rgba(34,211,238,0.22)] dark:ring-cyan-300/20"
						decoding="async"
						height="512"
						src="/web-app-manifest-512x512.png"
						width="512"
					/>
				</div>
				<div className="mt-8 grid gap-3">
					<p
						className="font-display text-5xl font-semibold text-neutral-950 sm:text-7xl dark:text-neutral-50"
						id="about-title"
						translate="no">
						aidd
					</p>
					<p className="text-base font-medium text-cyan-800 sm:text-lg dark:text-cyan-200">
						AI Development Director
					</p>
					<p className="font-mono text-xs text-neutral-500 uppercase dark:text-neutral-400">
						Version {__AIDD_VERSION__}
					</p>
				</div>
			</section>
		</div>
	);
}
