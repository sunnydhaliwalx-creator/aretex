import { useEffect, useState } from 'react';
import Head from 'next/head';
import { fetchStock } from '../utils/sheetsAPI';

export default function UsagePage() {
	const [rows, setRows] = useState([]);
	const [pharmacyKeys, setPharmacyKeys] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');

	useEffect(() => {
		let mounted = true;
			const load = async () => {
				try {
					setLoading(true);
					setError('');

					// Get session from server (contains spreadsheetId and groupPharmacyCodes)
					const sessRes = await fetch('/api/session');
					if (!sessRes.ok) throw new Error('Unable to load session');
					const sessJson = await sessRes.json();
					const session = sessJson.session;
					if (!session || !session.spreadsheetId) {
						throw new Error('No session or spreadsheetId available');
					}

					const spreadsheetId = session.spreadsheetId;
					const groupPharmacyCodes = Array.isArray(session.groupPharmacyCodes) ? session.groupPharmacyCodes : [];

					const data = await fetchStock(spreadsheetId, groupPharmacyCodes);
					console.log('Usage data', data);
					if (!mounted) return;
					setRows(data || []);

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

	return (
		<div className="container mt-4">
			<Head>
				<title>Aretex - Usage</title>
			</Head>

			<h3 className="mb-3">Usage</h3>

			{loading && <div className="alert alert-info">Loading...</div>}
			{error && <div className="alert alert-danger">{error}</div>}

			{!loading && !error && (
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
							{rows.map((r, idx) => (
								<tr key={idx}>
									<td className="bg-light">{r.item}</td>
									{pharmacyKeys.map((key) => {
										const p = r.pharmacies && r.pharmacies[key] ? r.pharmacies[key] : { inStockValue: null, usageValue: null };
										return (
											<td className="text-center" key={key}>
												<div style={{fontWeight:600}}>{p.inStockValue === null ? '' : p.inStockValue}</div>
												<div className="small text-muted">{p.usageValue === null ? '' : p.usageValue}</div>
											</td>
										);
									})}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
