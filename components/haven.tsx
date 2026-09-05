'use client';

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Image, Folder, Play, AlignLeft, ArrowUpRight, RotateCcw, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { apps, type HavenApp } from '@/lib/apps';

const icons = { photos: Image, files: Folder, media: Play, notes: AlignLeft };
type Paint = { x: number; y: number; size: number; key: number };

function AppTile({ app, index, onOpen }: { app: HavenApp; index: number; onOpen: (app: HavenApp) => void }) {
  const [paint, setPaint] = useState<Paint | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const Icon = icons[app.id as keyof typeof icons] ?? Folder;
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function activate(event: MouseEvent<HTMLButtonElement>) {
    if (timer.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const keyboard = event.detail === 0;
    const x = keyboard ? rect.width / 2 : event.clientX - rect.left;
    const y = keyboard ? rect.height / 2 : event.clientY - rect.top;
    setPaint({ x, y, size: Math.hypot(rect.width, rect.height) * 2.6, key: Date.now() });
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current = setTimeout(() => {
      timer.current = null;
      onOpen(app);
      setPaint(null);
    }, reduced ? 0 : 760);
  }

  return <li className="tile-arrival" style={{ '--order': index } as CSSProperties}>
    <button ref={button} className={`app-tile ${paint ? 'is-painting' : ''}`} onClick={activate}
      aria-label={`Open ${app.name}`} style={{ '--tint': app.color, '--ink': app.ink } as CSSProperties}>
      <span className="glass-face" aria-hidden="true" />
      <span className="initial-wash" aria-hidden="true" />
      <span className="tile-art" aria-hidden="true"><Icon strokeWidth={1.1} className={`sculpted-icon icon-${app.id}`} /></span>
      <span className="tile-caption"><span className="app-name">{app.name}</span><ArrowUpRight className="open-arrow" size={20} aria-hidden="true" /></span>
      {paint && <span className="paint-origin" aria-hidden="true" style={{ left: paint.x, top: paint.y }}>
        <span key={paint.key} className="paint-bloom" style={{ width: paint.size, height: paint.size }} />
        <span className="paint-droplet droplet-one" /><span className="paint-droplet droplet-two" /><span className="paint-droplet droplet-three" />
      </span>}
      <span className="glass-edge" aria-hidden="true" />
    </button>
  </li>;
}

export function Haven() {
  const [entrance, setEntrance] = useState(0);
  const [selected, setSelected] = useState<HavenApp | null>(null);
  const lastApp = useRef<string | null>(null);
  const SelectedIcon = selected ? icons[selected.id as keyof typeof icons] ?? Folder : Folder;

  function openApp(app: HavenApp) {
    lastApp.current = app.name;
    if (app.href) { window.location.assign(app.href); return; }
    setSelected(app);
  }

  return <>
    <header className="site-header">
      <a className="brand" href="/" aria-label="Mosaic Haven home"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span><span>Mosaic Haven</span></a>
      <div className="header-actions"><button className="replay" onClick={() => setEntrance(n => n + 1)} aria-label="Replay entrance animation"><RotateCcw size={16} /><span>Replay</span></button><span className="user-name">Isaac</span></div>
    </header>
    <main className="home"><h1 className="sr-only">Your applications</h1><ul key={entrance} className="app-grid" aria-label="Applications">{apps.map((app, index) => <AppTile key={app.id} app={app} index={index} onOpen={openApp} />)}</ul></main>
    <Dialog.Root open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="app-preview" style={{ '--tint': selected?.color, '--ink': selected?.ink } as CSSProperties}
        onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>(`button[aria-label="Open ${lastApp.current}"]`)?.focus(); }}>
        <Dialog.Close className="close-preview" aria-label="Close preview"><X size={20} /></Dialog.Close>
        <span className="preview-art" aria-hidden="true"><SelectedIcon strokeWidth={1.1} /></span>
        <Dialog.Title>{selected?.name}</Dialog.Title>
        <Dialog.Description>This app isn&apos;t connected yet.</Dialog.Description>
        <Dialog.Close className="return-button">Back to your apps <span aria-hidden="true">↗</span></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}
