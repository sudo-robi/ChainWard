
"use client";

import React, { useEffect, useState } from 'react';

const AlertSentry = () => {
    const [alerts, setAlerts] = useState<any[]>([]);

    useEffect(() => {
        const eventSource = new EventSource('/api/alerts/stream');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (process.env.NODE_ENV === 'development') {
                console.log('📡 Real-time Event Received:', data);
            }

            // Add to local stack for notifications
            setAlerts(prev => [data, ...prev].slice(0, 5));

            // Logic to trigger UI refresh
            // Since our components use internal polling, a simple way to force refresh is to 
            // dispatch a custom event that components can listen to, or simply wait for their cycle.
            // For immediate feedback, we'll use a custom event.
            window.dispatchEvent(new CustomEvent('chainward-refresh', { detail: data }));

            // Auto-clear notification after 10s
            setTimeout(() => {
                setAlerts(prev => prev.filter(a => a !== data));
            }, 10000);
        };

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none">
            {alerts.map((alert, i) => (
                <div key={i} className={`p-4 rounded-lg shadow-2xl border-l-4 pointer-events-auto animate-in slide-in-from-right duration-500 overflow-hidden ${alert.type.includes('RAISED') || alert.type.includes('FAILURE')
                        ? 'bg-red-900/90 text-white border-red-500'
                        : 'bg-zinc-900/90 text-zinc-100 border-green-500'
                    }`}>
                    <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold opacity-60 uppercase">{alert.type.replace('_', ' ')}</span>
                        <div className="h-2 w-2 rounded-full bg-current animate-pulse"></div>
                    </div>
                    <div className="text-sm font-bold truncate">
                        {alert.payload.description || alert.payload.reason || 'Network Event'}
                    </div>
                    {alert.payload.chainId &&(
                        <div className="text-[10px] opacity-50 mt-1 uppercase">Chain ID: {alert.payload.chainId}</div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default AlertSentry;
