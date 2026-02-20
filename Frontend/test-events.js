const { ethers } = require('ethers');
require('dotenv').config({ path: './Frontend/.env.local' });

async function main() {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const managerAddress = process.env.INCIDENT_MANAGER_ADDRESS;

    console.log('Manager Address:', managerAddress);

    const abi = [
        "event IncidentReported(uint256 indexed incidentId, address indexed reporter, string incidentType, uint256 severity, uint256 timestamp)",
        "event IncidentValidated(uint256 indexed incidentId, address indexed validator, bool approved)",
        "event IncidentResolved(uint256 indexed incidentId, uint256 timestamp)"
    ];

    const manager = new ethers.Contract(managerAddress, abi, provider);

    try {
        console.log('Fetching IncidentReported events...');
        const reportedFilter = manager.filters.IncidentReported();
        const reportedEvents = await manager.queryFilter(reportedFilter, -500000); // Check last 500k blocks
        console.log(`Found ${reportedEvents.length} IncidentReported events`);

        reportedEvents.forEach(ev => {
            console.log(`- Incident #${ev.args.incidentId}: ${ev.args.incidentType} by ${ev.args.reporter}`);
        });

        console.log('\nFetching IncidentValidated events...');
        const validatedFilter = manager.filters.IncidentValidated();
        const validatedEvents = await manager.queryFilter(validatedFilter, -500000);
        console.log(`Found ${validatedEvents.length} IncidentValidated events`);

        console.log('\nFetching IncidentResolved events...');
        const resolvedFilter = manager.filters.IncidentResolved();
        const resolvedEvents = await manager.queryFilter(resolvedFilter, -500000);
        console.log(`Found ${resolvedEvents.length} IncidentResolved events`);

    } catch (e) {
        console.error('Error:', e);
    }
}

main();
