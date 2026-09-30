"use strict";

function matchesTaskFilters(task, { categories, status, search, date, effectiveStatus }) {
  const category = task.category_id || "uncategorized";
  return (!categories.size || categories.has(category)) &&
    (status === "all" || effectiveStatus === status) &&
    (!search || task.title.toLocaleLowerCase().includes(search)) &&
    (!date || (task.start_date <= date && date <= task.end_date));
}

if (typeof module !== "undefined") module.exports = { matchesTaskFilters };
