'use client';

import { useEffect, useRef, useState } from 'react';

export function PublicMotion() {
    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                entry.target.classList.add('public-revealed');
                observer.unobserve(entry.target);
            }
        }, { threshold: 0.12 });
        document.querySelectorAll('.marketing-section, .marketing-story, .marketing-closing, .claim-chart').forEach(section => observer.observe(section));
        return () => observer.disconnect();
    }, []);
    return null;
}

export function AnimatedFigure({ value }: { value: string }) {
    const element = useRef<HTMLSpanElement>(null);
    const [display, setDisplay] = useState(value);

    useEffect(() => {
        if (!element.current || !('IntersectionObserver' in window)) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const match = /[\d,]+(?:\.\d+)?/.exec(value);
        if (!match || reducedMotion.matches) return;
        const number = Number(match[0].replaceAll(',', ''));
        const digits = match[0].split('.')[1]?.length ?? 0;
        const formatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: match[0].includes(',') });
        let frame = 0;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry?.isIntersecting || !match) return;
            observer.disconnect();
            const started = performance.now();
            const update = (now: number) => {
                const progress = Math.min((now - started) / 550, 1);
                if (progress >= 1 || reducedMotion.matches) {
                    setDisplay(value);
                    return;
                }
                const animated = number * (1 - (1 - progress) ** 3);
                setDisplay(value.replace(match[0], formatter.format(animated)));
                frame = requestAnimationFrame(update);
            };
            frame = requestAnimationFrame(update);
        });
        observer.observe(element.current);
        return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }, [value]);

    return <><span className="public-sr-only">{value}</span><span ref={element} aria-hidden="true">{display}</span></>;
}
