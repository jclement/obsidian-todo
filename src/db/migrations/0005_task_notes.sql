-- Sub-bullet notes + toggleable sub-checklists captured under each task.
ALTER TABLE tasks ADD COLUMN notes    TEXT NOT NULL DEFAULT '';
ALTER TABLE tasks ADD COLUMN subitems TEXT NOT NULL DEFAULT '[]';
