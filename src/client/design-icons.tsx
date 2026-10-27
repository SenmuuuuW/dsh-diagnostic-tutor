/** Minimal stroke icons for the design-system surfaces. */
import type { ReactNode } from 'react'

export type IconName =
  | 'map'
  | 'chat'
  | 'route'
  | 'book'
  | 'arrow-left'
  | 'arrow-right'
  | 'chevron-right'
  | 'check'
  | 'clock'
  | 'search'
  | 'grid'
  | 'info'
  | 'warning'
  | 'close'
  | 'target'
  | 'spark'
  | 'layers'
  | 'code'
  | 'planet'
  | 'graph'
  | 'file'

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }): ReactNode {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className, 'aria-hidden': true as const, focusable: 'false' as const,
  }
  switch (name) {
    case 'map': return <svg {...common}><path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" /><path d="M9 4v13M15 6.5v13" /></svg>
    case 'chat': return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 9 9 0 0 1-3.8-.8L3 21l1.9-4.5A8 8 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" /></svg>
    case 'route': return <svg {...common}><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M8.4 18h4.1a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.6" /></svg>
    case 'book': return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H18v3H6.5A2.5 2.5 0 0 1 4 20.5Z" /></svg>
    case 'arrow-left': return <svg {...common}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
    case 'arrow-right': return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    case 'chevron-right': return <svg {...common}><path d="m9 5 7 7-7 7" /></svg>
    case 'check': return <svg {...common}><path d="m4 12.5 5 5L20 6.5" /></svg>
    case 'clock': return <svg {...common}><circle cx="12" cy="12" r="8.4" /><path d="M12 7v5.4l3.4 2" /></svg>
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="6.6" /><path d="m16 16 4.2 4.2" /></svg>
    case 'grid': return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1.4" /><rect x="13" y="4" width="7" height="7" rx="1.4" /><rect x="4" y="13" width="7" height="7" rx="1.4" /><rect x="13" y="13" width="7" height="7" rx="1.4" /></svg>
    case 'info': return <svg {...common}><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5M12 7.8v.2" /></svg>
    case 'warning': return <svg {...common}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17.2v.2" /></svg>
    case 'close': return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'target': return <svg {...common}><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".8" /></svg>
    case 'spark': return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
    case 'layers': return <svg {...common}><path d="m12 3 8.5 4.7L12 12.4 3.5 7.7 12 3Z" /><path d="m3.5 12.3 8.5 4.7 8.5-4.7" /><path d="m3.5 16.7 8.5 4.7 8.5-4.7" /></svg>
    case 'code': return <svg {...common}><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></svg>
    case 'planet': return <svg {...common}><circle cx="12" cy="11" r="6" /><path d="M5.2 14.8C2.6 16.2 1.4 18 2.2 19.1c1.2 1.6 5.9.4 10.6-2.7 4.6-3 8-6.6 7.4-8.3-.4-1.2-2.6-1.2-5.4-.2" /></svg>
    case 'graph': return <svg {...common}><circle cx="5.5" cy="17" r="2.2" /><circle cx="12" cy="6.5" r="2.2" /><circle cx="18.5" cy="17" r="2.2" /><path d="M7.4 15.5 10.4 8.6M13.4 8.4l3.7 6.8M7.7 17h8.6" /></svg>
    case 'file': return <svg {...common}><path d="M6 3h7l5 5v13H6V3Z" /><path d="M13 3v5h5" /></svg>
  }
}
