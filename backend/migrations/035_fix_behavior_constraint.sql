-- Migration: Fix Browsing Behavior Constraints
-- Description: Drops the restrictive check constraint to allow all event types from the Ultimate Pixel.

ALTER TABLE browsing_events DROP CONSTRAINT IF EXISTS browsing_events_event_type_check;
