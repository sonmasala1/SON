'use client';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useStore } from './StoreProvider';
import CartContents from './CartContents';
import Icon from './Icon';

export default function CartDrawer() {
  const { drawerOpen, setDrawerOpen } = useStore();
  const panel = useRef(null);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('button')?.focus();
    function keydown(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
      if (event.key === 'Tab') {
        const elements = [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)')].filter(el => el.getClientRects().length);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [drawerOpen, setDrawerOpen]);
  if (!drawerOpen) return null;
  return <div className="drawer-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setDrawerOpen(false); }}><aside ref={panel} className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div className="drawer-heading"><div><p className="eyebrow"><Text>{"A LITTLE FLAVOUR TO TAKE HOME"}</Text></p><h2 id="drawer-title"><Text>{"Your shopping bag"}</Text></h2></div><LocalizedAttrs><button className="icon-button" onClick={() => setDrawerOpen(false)} aria-label="Close shopping bag"><Icon name="close" /></button></LocalizedAttrs></div><CartContents compact /><Link href="/cart" onClick={() => setDrawerOpen(false)} className="text-link drawer-cart-link"><Text>{"View full shopping bag "}</Text><Icon size={24} /></Link></aside></div>;
}
