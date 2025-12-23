import { useEffect, useState } from 'react';
import Head from 'next/head';
import { fetchStock } from '../utils/stockAPI';

export default function UsagePage() {
	const [rows, setRows] = useState([]);
	const [filteredRows, setFilteredRows] = useState([]);
	const [filterInput, setFilterInput] = useState('');
	const [pharmacyKeys, setPharmacyKeys] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let mounted = true;
			const load = async () => {
				try {
					setLoading(true);
					setError('');

					// Get session from server (contains clientSpreadsheet.spreadsheetId and groupPharmacyNames)
					const sessRes = await fetch('/api/session');
					if (!sessRes.ok) throw new Error('Unable to load session');
					const sessJson = await sessRes.json();
					const session = sessJson.session;
					if (!session || !session.clientSpreadsheet?.spreadsheetId) {
						throw new Error('No session or clientSpreadsheet.spreadsheetId available');
					}

					const spreadsheetId = session.clientSpreadsheet.spreadsheetId;
	          		const groupPharmacyCodes = Array.isArray(session.groupPharmacyNames) && session.groupPharmacyNames.length > 0
	          			? session.groupPharmacyNames
	          			: [session.pharmacyName];				
					const data = await fetchStock(spreadsheetId, groupPharmacyCodes, false);
					console.log(spreadsheetId, groupPharmacyCodes,'Usage data', data);
					if (!mounted) return;
					setRows(data || []);
					setFilteredRows(data || []); // Initialize filtered rows with all data

					// Build ordered list of pharmacy keys found across rows
					const keysSet = new Set();
					(data || []).forEach(r => {
						if (r && r.pharmacies) {
							Object.keys(r.pharmacies).forEach(k => keysSet.add(k));
						}
					});

					setPharmacyKeys(Array.from(keysSet));
				} catch (err) {
					console.error('Usage load error', err);
					if (mounted) setError(err.message || 'Failed to load usage data');
				} finally {
					if (mounted) setLoading(false);
				}
			};

		load();
		return () => { mounted = false; };
	}, []);

	// Simple fuzzy scoring: token match + sequential match bonus - length penalty
	const scoreItem = (query, target) => {
		if (!query) return 0;
		const q = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
		const t = target.toLowerCase();

		let score = 0;
		// token matches
		for (const token of q) {
			if (t.includes(token)) score += token.length;
		}

		// proximity: reward continuous occurrence
		const joined = q.join(' ');
		if (joined && t.includes(joined)) score += 10;

		// shorter target slightly preferred
		score -= Math.max(0, (t.length - joined.length) / 50);

		return score;
	};

	// Filter rows when filter input or rows change
	useEffect(() => {
		// If no query, show all rows
		if (!filterInput || !filterInput.trim()) {
			setFilteredRows(rows);
			return;
		}

		// Use fuzzy scoring against item name
		const q = filterInput.trim();
		const scored = rows.map((row, i) => {
			const itemStr = row.item || '';
			return { row, score: scoreItem(q, itemStr), index: i };
		});

		const top = scored
			.filter(s => s.score > 0)
			.sort((a, b) => b.score - a.score)
			.map(s => s.row);

		setFilteredRows(top);
	}, [filterInput, rows]);

	const handleFilterChange = (e) => {
		setFilterInput(e.target.value);
	};

	return (
		<div className="container mt-4">
			<Head>
				<title>Aretex - Monthly Usage</title>
			</Head>

		<h3 className="mb-3">Monthly Usage</h3>

		{loading && <div className="alert alert-info">Loading...</div>}
		{error && <div className="alert alert-danger">{error}</div>}

		{!loading && !error && (
			<>
				{/* Filter input */}
				<div className="mb-1">
					<input 
						type="text" 
						className="form-control" 
						placeholder="Filter items..."
						value={filterInput}
						onChange={handleFilterChange}
					/>
				</div>
				
				<div className="table-responsive">
					<table className="table table-light table-striped table-bordered table-hover">
						<thead className="table-light table-striped">
							<tr>
								<th>Item</th>
								{pharmacyKeys.map((key) => (
									<th className="text-center" key={key}>{key}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{filteredRows.map((r, idx) => (
								<tr key={idx}>
									<td className="bg-light">{r.item}</td>
									{pharmacyKeys.map((key) => {
										const p = r.pharmacies && r.pharmacies[key] ? r.pharmacies[key] : { inStockValue: null, usageValue: null };
										return (
											<td className="text-center" key={key}>
												<div style={{fontWeight:600}}>{p.usageValue === null ? '' : p.usageValue}</div>
											</td>
										);
									})}
						</tr>
					))}
					</tbody>
				</table>
			</div>
			</>
		)}
		</div>
	);
}
