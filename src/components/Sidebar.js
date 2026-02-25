'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';

var NAV_ITEMS = [
    { id: '/', label: 'Dashboard', icon: 'fa-gauge-high' },
    { id: '/recepten', label: 'Recepten', icon: 'fa-utensils' },
    { id: '/facturen', label: 'Facturen', icon: 'fa-file-invoice' },
    { id: '/offertes', label: 'Offertes', icon: 'fa-file-signature' },
    { id: '/events', label: 'Events', icon: 'fa-fire' },
    { id: '/agenda', label: 'Agenda', icon: 'fa-calendar-days' },
    { id: '/logistiek', label: 'Logistiek', icon: 'fa-truck' },
    { id: '/haccp', label: 'HACCP', icon: 'fa-shield-halved' },
    { id: '/inkoop', label: 'Inkoop', icon: 'fa-boxes-stacked' },
    { id: '/materieel', label: 'Materieel', icon: 'fa-wrench' },
    { id: '/boekhouding', label: 'Boekhouding', icon: 'fa-chart-line' },
    { id: '/instellingen', label: 'Instellingen', icon: 'fa-gear' },
];

export default function Sidebar() {
    var pathname = usePathname();
    var [open, setOpen] = useState(false);

    function getLabelForPath() {
        var item = NAV_ITEMS.find(function (n) { return n.id === pathname; });
        return item ? item.label : 'BBQ Architect';
    }

    return (
        <>
            {/* Mobile header bar */}
            <div className="main-header">
                <button className="hamburger" onClick={function () { setOpen(true); }}>
                    <i className="fa-solid fa-bars"></i>
                </button>
                <h2>{getLabelForPath()}</h2>
                <div style={{ width: 28 }}></div>
            </div>

            {/* Overlay */}
            <div className={'sidebar-overlay' + (open ? ' open' : '')} onClick={function () { setOpen(false); }}></div>

            {/* Sidebar */}
            <aside className={'sidebar' + (open ? ' open' : '')}>
                <div className="sidebar-logo">
                    <h1><i className="fa-solid fa-fire"></i> BBQ Architect</h1>
                    <p>Hop &amp; Bites</p>
                </div>
                <nav className="sidebar-nav">
                    {NAV_ITEMS.map(function (item) {
                        var isActive = pathname === item.id || (item.id !== '/' && pathname.startsWith(item.id));
                        return (
                            <Link
                                key={item.id}
                                href={item.id}
                                className={isActive ? 'active' : ''}
                                onClick={function () { setOpen(false); }}
                            >
                                <i className={'fa-solid ' + item.icon}></i>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>
        </>
    );
}
