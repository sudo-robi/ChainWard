
"use client";

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { config } from '../config';

const MonitorAbi = [
    "function addComment(uint256 incidentId, string calldata comment) external",
    "function setRCATag(uint256 incidentId, string calldata tag) external",
    "function resolveIncident(uint256 incidentId, string calldata reason) external"
];

interface Props {
    incidentId: string;
    onActionComplete?: () => void;
}

const IncidentManagementActions: React.FC<Props> = ({ incidentId, onActionComplete }) => {
    const [comment, setComment] = useState('');
    const [rca, setRca] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAddComment = async () => {
        if (!comment) return;
        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();
            const monitor = new ethers.Contract(config.incidentManagerAddress, MonitorAbi, signer);

            const tx = await monitor.addComment(incidentId, comment);
            await tx.wait();
            setComment('');
            if (onActionComplete) onActionComplete();
        } catch (e) {
            console.error("Add comment error:", e);
            alert("Error adding comment. Make sure you are the owner/reporter.");
        } finally {
            setLoading(false);
        }
    };

    const handleSetRCA = async () => {
        if (!rca) return;
        setLoading(true);
        try {
            const provider = new ethers.BrowserProvider((window as any).ethereum);
            const signer = await provider.getSigner();
            const monitor = new ethers.Contract(config.incidentManagerAddress, MonitorAbi, signer);

            const tx = await monitor.setRCATag(incidentId, rca);
            await tx.wait();
            setRca('');
            if (onActionComplete) onActionComplete();
        } catch (e) {
            console.error("Set RCA error:", e);
            alert("Error setting RCA. Only owner can do this.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mt-4 p-3 bg-card-secondary rounded-lg border border-card-border space-y-4">
            <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase opacity-60">Add Comment</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Investigation notes..."
                        className="flex-1 bg-background border border-card-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                        onClick={handleAddComment}
                        disabled={loading}
                        className="bg-primary hover:bg-primary/80 px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                    >
                        {loading ? '...' : 'Post'}
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[11px] font-bold uppercase opacity-60">Set RCA Tag</label>
                <div className="flex gap-2">
                    <select
                        value={rca}
                        onChange={(e) => setRca(e.target.value)}
                        className="flex-1 bg-background border border-card-border rounded px-2 py-1 text-sm focus:outline-none"
                    >
                        <option value="">Select Root Cause...</option>
                        <option value="Sequencer Software Bug">Sequencer Software Bug</option>
                        <option value="Network Congestion">Network Congestion</option>
                        <option value="RPC Endpoint Failure">RPC Endpoint Failure</option>
                        <option value="Governance Halt">Governance Halt</option>
                        <option value="Unknown Infrastructure Issue">Unknown Infrastructure Issue</option>
                    </select>
                    <button
                        onClick={handleSetRCA}
                        disabled={loading}
                        className="bg-accent hover:bg-accent/80 px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                    >
                        {loading ? '...' : 'Tag'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IncidentManagementActions;
