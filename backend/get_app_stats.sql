SELECT platform, COUNT(*) as device_count
FROM push_subscriptions
GROUP BY platform;
