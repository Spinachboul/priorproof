'use client';

import { useEffect, useId, useState } from 'react';
import { Play, Pause } from 'lucide-react';

export type WorkflowStage = { title: string; detail: string; scope: string; inScope?: boolean };

export function WorkflowExplorer({ label, stages, play = false }: {
    label: string;
    stages: readonly WorkflowStage[];
    play?: boolean;
}) {
    const [selected, setSelected] = useState(0);
    const [playing, setPlaying] = useState(false);
    const id = useId();
    const stage = stages[selected];
    useEffect(() => {
        if (!playing) return;
        const timer = window.setInterval(() => {
            if (selected === stages.length - 1) setPlaying(false);
            else setSelected(selected + 1);
        }, 4100);
        return () => window.clearInterval(timer);
    }, [playing, selected, stages.length]);

    return <section className="workflow-explorer public-panel" aria-label={label}>
        {play && <div className="workflow-player">
            <button className="public-button outline" type="button" onClick={() => {
                if (!playing && selected === stages.length - 1) setSelected(0);
                setPlaying(!playing);
            }}>{playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}{playing ? 'Pause walkthrough' : 'Play walkthrough'}</button>
        </div>}
        <ol className="workflow-stages">
            {stages.map((item, index) => <li key={item.title}>
                <button className={item.inScope ? 'in-scope' : undefined} type="button" aria-controls={id}
                    aria-current={index === selected ? 'step' : undefined}
                    onClick={() => { setPlaying(false); setSelected(index); }}>
                    <span>{item.title}</span><small>{item.scope}</small>
                </button>
            </li>)}
        </ol>
        <div id={id} aria-live={playing ? 'off' : 'polite'} className="workflow-stage-detail">
            <div className="workflow-detail-copy" key={stage.title}>
                <p className="marketing-kicker">{stage.scope}</p>
                <h3>{stage.title}</h3>
                <p>{stage.detail}</p>
            </div>
        </div>
    </section>;
}
