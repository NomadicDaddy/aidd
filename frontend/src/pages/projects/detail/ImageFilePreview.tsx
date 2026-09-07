import { useEffect, useState } from 'react';

import { EmptyState } from '../../../components/shared/EmptyState.tsx';
import { Skeleton } from '../../../components/ui/skeleton.tsx';

export interface ImageSize {
	height: number;
	width: number;
}

type ImageProbe =
	{ size: ImageSize; status: 'ready' } | { status: 'error' } | { status: 'loading' };

/**
 * Decodes `src` off-screen and reports its natural size.
 *
 * An <img> with no width/height is a zero-height box until the bytes arrive and then whatever
 * the file says, which reflows everything below it. Decoding first means the element is only
 * ever mounted with its real aspect ratio already attached, so the preview pane reserves the
 * right space on the first paint instead of the second.
 *
 * The caller must key this component on `src`; the hook deliberately has no cross-source reset
 * path, because remounting is both cheaper and harder to get subtly wrong than reconciling a
 * decode already in flight against a new source.
 */
function useImageIntrinsicSize(src: string): ImageProbe {
	const [probe, setProbe] = useState<ImageProbe>({ status: 'loading' });

	useEffect(() => {
		let live = true;
		const image = new Image();
		image.src = src;
		image
			.decode()
			.then(() => {
				if (!live) return;
				setProbe({
					size: { height: image.naturalHeight, width: image.naturalWidth },
					status: 'ready',
				});
			})
			.catch(() => {
				if (live) setProbe({ status: 'error' });
			});
		return () => {
			live = false;
		};
	}, [src]);

	return probe;
}

/**
 * The decoded preview itself. Split out from the probing container so its markup — the intrinsic
 * attributes and the responsive caps that must survive them — is renderable without a DOM.
 */
export function DecodedImage({ alt, size, src }: { alt: string; size: ImageSize; src: string }) {
	return (
		<img
			alt={alt}
			// The intrinsic attributes give the box its aspect ratio; these caps keep it inside a
			// narrow pane regardless of how large the file actually is.
			className="max-h-full max-w-full object-contain"
			height={size.height}
			src={src}
			width={size.width}
		/>
	);
}

export function ImageFilePreview({ alt, src }: { alt: string; src: string }) {
	const probe = useImageIntrinsicSize(src);

	if (probe.status === 'error') {
		return <EmptyState>Image file could not be loaded.</EmptyState>;
	}
	if (probe.status === 'loading') {
		return (
			<div aria-busy="true" aria-live="polite" className="w-full max-w-md">
				<span className="sr-only">Loading image preview…</span>
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}
	return <DecodedImage alt={alt} size={probe.size} src={src} />;
}
