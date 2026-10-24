CREATE TABLE `service_status` (
	`id` text PRIMARY KEY NOT NULL,
	`last_started` text,
	`last_success` text,
	`last_error` text
);
