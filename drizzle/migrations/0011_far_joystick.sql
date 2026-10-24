CREATE INDEX `enquiry_customer` ON `enquiries` (`customer_id`);--> statement-breakpoint
CREATE INDEX `task_enquiry_status_due` ON `tasks` (`enquiry_id`,`status`,`due_at`);