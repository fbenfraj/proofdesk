ALTER TABLE `proof_requirement` ADD `disclosure_key` text;--> statement-breakpoint
UPDATE `proof_requirement` SET `disclosure_key` = 'collaboration-commerciale' WHERE `kind` = 'disclosure-visible' AND `disclosure_key` IS NULL AND (`label` = '' OR `label` = 'Required France/EU disclosure visibly evidenced');
