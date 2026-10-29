-- Keep trip deletion and concurrent enquiry creation/reassignment consistent.
CREATE TRIGGER enquiry_active_trip_insert BEFORE INSERT ON enquiries
WHEN EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND json_extract(data,'$.deletedAt') IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Trip is deleted. Choose another trip.'); END;
CREATE TRIGGER enquiry_active_trip_update BEFORE UPDATE OF trip_id ON enquiries
WHEN NEW.trip_id<>OLD.trip_id AND EXISTS(SELECT 1 FROM trips WHERE id=NEW.trip_id AND json_extract(data,'$.deletedAt') IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Trip is deleted. Choose another trip.'); END;
