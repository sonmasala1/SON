export default function Icon({ name = 'arrow', size = 24, className = '', ...props }) {
  const paths = {
    arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    profile: <><circle cx="12" cy="12" r="10" /><circle cx="12" cy="9" r="3" /><path d="M6 20v-1a6 6 0 0 1 12 0v1" /></>,
    cart: <><path d="M2 3h3l3 13h11l3-10H6" /><circle cx="9" cy="21" r="1" /><circle cx="19" cy="21" r="1" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
    bag: <><path d="M5 7h14l1 14H4L5 7Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    leaf: <><path d="M20 3C5 2 2 9 5 16c7 5 16 0 15-13Z" /><path d="m3 21 12-12" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m7 12 3 3 7-7" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    phone: <path d="m5 3 4 4-2 3c2 4 3 5 7 7l3-2 4 4c-4 7-18-3-18-12Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return <svg className={`app-icon ${className}`.trim()} data-icon={name} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.arrow}</svg>;
}
