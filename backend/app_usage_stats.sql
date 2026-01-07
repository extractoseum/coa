-- 1. Count push tokens by platform
SELECT platform, COUNT(*) as device_count
FROM push_tokens
GROUP BY platform;

-- 2. Count recent app scans (assuming access_type = 'app' or similar)
SELECT access_type, COUNT(*) as scan_count
FROM coa_scans
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY access_type;
