import Link from 'next/link';

export default function Sidebar() {
  const menuItems = [
    { name: 'Dashboard', icon: 'fa-th-large', href: '/' },
    { name: 'Events', icon: 'fa-calendar-alt', href: '/events' },
    { name: 'The Vault', icon: 'fa-lock', href: '/vault' },
    { name: 'Foodcost AI', icon: 'fa-calculator', href: '/calculator' },
    { name: 'HACCP', icon: 'fa-temperature-high', href: '/haccp' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Architect</h1>
        <p>BY HOP & BITES</p>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <Link key={item.name} href={item.href}>
            <i className={`fas ${item.icon}`}></i>
            <span>{item.name}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}