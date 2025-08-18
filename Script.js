// Use a mock API for local development if SCRIPT_WEB_APP_URL is not defined
const SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxiS3wXwXCyh8xM1EdTiwXy0T-UyBRQgfrnRRis531lTxmgtJIGawfsPeetX5nVJW3V/exec'; // Replace with your actual deployed Google Apps Script URL

let allOrders = []; // Raw data of all orders - נתוני ההזמנות הגולמיים
let currentEditingOrder = null; // Variable to store the order being edited - משתנה לאחסון ההזמנה הנערכת
let autoFillData = null; // To store data for autofill suggestions - לאחסון נתונים עבור הצעות למילוי אוטומטי
let currentPage = 1; // Current page for pagination - העמוד הנוכחי ל pagination
const rowsPerPage = 10; // Number of rows per page - מספר שורות לעמוד
let currentSortColumn = null; // Stores the index of the column currently sorted - אינדקס העמודה הממוינת
let currentSortDirection = 'asc'; // Stores the sort direction ('asc' or 'desc') - כיוון המיון

// Centralized cache for autocomplete suggestions to minimize redundant lookups
// מטמון מרכזי להצעות השלמה אוטומטית כדי למזער חיפושים מיותרים
const autocompleteCache = {
    'שם לקוח': new Set(),
    'כתובת': new Set(),
    'תעודה': new Set(),
    'שם סוכן': new Set(),
    'מספר מכולה ירדה': new Set(),
    'מספר מכולה עלתה': new Set()
};

// Utility Functions - פונקציות עזר
function showLoader() { document.getElementById('loader-overlay').classList.add('active'); }
function hideLoader() { document.getElementById('loader-overlay').classList.remove('active'); }

/**
 * Determines if the current device is mobile based on screen width.
 * @returns {boolean} True if mobile, false otherwise.
 * קובע אם המכשיר הנוכחי הוא נייד לפי רוחב המסך.
 */
function isMobile() {
    return window.innerWidth <= 768; // Tailwind's 'md' breakpoint
}

/**
 * Toggles between light and dark themes and saves the preference.
 * מחליף בין מצב בהיר לכהה ושומר את ההעדפה.
 */
function toggleTheme() {
    document.body.classList.toggle('dark');
    const isDarkMode = document.body.classList.contains('dark');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateThemeToggleButton();
}

/**
 * Updates the theme toggle button icon and text based on the current theme.
 * מעדכן את אייקון וכפתור שינוי העיצוב (בהיר/כהה) לפי מצב העיצוב הנוכחי.
 */
function updateThemeToggleButton() {
    const themeToggle = document.getElementById('theme-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    if (document.body.classList.contains('dark')) {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
        themeToggle.querySelector('span').textContent = 'מצב כהה';
    } else {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
        themeToggle.querySelector('span').textContent = 'מצב בהיר';
    }
}

/**
 * Initializes the theme based on user's saved preference or system preference.
 * מאתחל את ערכת הנושא (בהיר/כהה) בהתאם להעדפת המשתמש השמורה או העדפת המערכת.
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.classList.add(savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark');
    }
    updateThemeToggleButton();
}

/**
 * Displays a customizable toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - The type of alert ('success', 'error', 'warning', 'info').
 * @param {number} [duration=3000] - Duration in milliseconds before the alert fades.
 * מציג התראת טוסט הניתנת להתאמה אישית.
 */
function showAlert(message, type, duration = 3000) {
    const alertContainer = document.getElementById('alert-container');
    const alertItem = document.createElement('div');
    alertItem.classList.add('alert-item', `alert-${type}`);
    alertItem.textContent = message;

    alertContainer.appendChild(alertItem);

    // Fade out and remove after duration
    setTimeout(() => {
        alertItem.style.opacity = '0';
        setTimeout(() => alertItem.remove(), 500); // Remove after transition
    }, duration);
}

/**
 * Fetches data from the Google Apps Script backend. Includes exponential backoff for retries.
 * @param {string} action - The action to perform (e.g., 'getOrders', 'addOrder').
 * @param {object} params - Parameters for the action.
 * @param {number} [retries=0] - Current retry count.
 * @returns {Promise<any>} The response data.
 * מבצע שליפת נתונים מהבק-אנד של Google Apps Script. כולל מנגנון ניסיונות חוזרים (exponential backoff).
 */
async function fetchData(action, params = {}, retries = 0) {
    showLoader();
    const maxRetries = 5;
    const delay = Math.pow(2, retries) * 100; // Exponential backoff

    try {
        const url = new URL(SCRIPT_WEB_APP_URL);
        url.searchParams.append('action', action);
        for (const key in params) {
            if (params.hasOwnProperty(key)) {
                url.searchParams.append(key, params[key]);
            }
            // For sending files, FormData is typically used, not URLSearchParams.
            // This function assumes simple key-value pairs.
            // File upload logic would need a different fetch body (e.g., FormData).
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        hideLoader();
        return data;
    } catch (error) {
        console.error(`Error in fetchData (${action}):`, error);
        if (retries < maxRetries) {
            console.log(`Retrying in ${delay}ms... (Attempt ${retries + 1} of ${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchData(action, params, retries + 1);
        } else {
            hideLoader();
            showAlert(`שגיאה בטעינת נתונים: ${error.message}`, 'error');
            throw error;
        }
    }
}

/**
 * Loads all orders from the backend and updates UI components.
 * טוען את כל ההזמנות מהבק-אנד ומעדכן את רכיבי הממשק.
 */
async function loadOrders() {
    try {
        const data = await fetchData('getOrders');
        if (data && data.status === 'success') {
            allOrders = data.orders || [];
            updateAutocompleteCache(allOrders);
            updateDashboard();
            renderOrdersTable(allOrders);
            checkAlerts(allOrders);
            drawCharts(allOrders);
            updateContainerInventory(); // Update inventory page after loading orders
            renderTreatmentBoard(allOrders); // Update treatment board
        } else {
            showAlert('שגיאה בטעינת הזמנות: ' + (data ? data.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}

/**
 * Populates the autocomplete cache with unique values from orders.
 * @param {Array<Object>} orders - The array of order objects.
 * מאכלס את מטמון ההשלמה האוטומטית בערכים ייחודיים מההזמנות.
 */
function updateAutocompleteCache(orders) {
    // Clear previous cache to avoid duplicates on reload
    for (const key in autocompleteCache) {
        autocompleteCache[key].clear();
    }

    orders.forEach(order => {
        autocompleteCache['שם לקוח'].add(order['שם לקוח']);
        autocompleteCache['כתובת'].add(order['כתובת']);
        autocompleteCache['תעודה'].add(order['תעודה']);
        autocompleteCache['שם סוכן'].add(order['שם סוכן']);
        if (order['מספר מכולה ירדה']) {
            autocompleteCache['מספר מכולה ירדה'].add(order['מספר מכולה ירדה']);
        }
        if (order['מספר מכולה עלתה']) {
            autocompleteCache['מספר מכולה עלתה'].add(order['מספר מכולה עלתה']);
        }
    });
}

/**
 * Implements client-side autocomplete functionality.
 * @param {HTMLInputElement} inputEl - The input element to apply autocomplete to.
 * @param {string} fieldName - The key in autocompleteCache to use for suggestions.
 * מיישם פונקציונליות השלמה אוטומטית בצד הלקוח.
 */
function autocomplete(inputEl, fieldName) {
    let currentFocus;
    const items = Array.from(autocompleteCache[fieldName] || new Set()).filter(Boolean); // Filter out empty strings

    inputEl.addEventListener("input", function(e) {
        let a, b, i, val = this.value;
        closeAllAutocompleteLists();
        if (!val) { return false; }
        currentFocus = -1;
        a = document.createElement("div");
        a.setAttribute("id", this.id + "-autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);

        for (i = 0; i < items.length; i++) {
            if (items[i].toUpperCase().includes(val.toUpperCase())) {
                b = document.createElement("div");
                b.innerHTML = highlightText(items[i], val);
                b.innerHTML += "<input type='hidden' value='" + items[i] + "'>";
                b.addEventListener("click", function(e) {
                    inputEl.value = this.getElementsByTagName("input")[0].value;
                    closeAllAutocompleteLists();
                });
                a.appendChild(b);
            }
        }
    });

    inputEl.addEventListener("keydown", function(e) {
        let x = document.getElementById(this.id + "-autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { // DOWN arrow
            currentFocus++;
            addActive(x);
        } else if (e.keyCode == 38) { // UP arrow
            currentFocus--;
            addActive(x);
        } else if (e.keyCode == 13) { // ENTER key
            e.preventDefault();
            if (currentFocus > -1) {
                if (x) x[currentFocus].click();
            } else if (x && x.length > 0) { // If no item is focused, select the first
                x[0].click();
            }
        }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }

    function removeActive(x) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove("autocomplete-active");
        }
    }

    function closeAllAutocompleteLists(elmnt) {
        const x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inputEl) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }

    document.addEventListener("click", function(e) {
        closeAllAutocompleteLists(e.target);
    });
}

/**
 * Updates dashboard cards with current order counts.
 * מעדכן את כרטיסי הדאשבורד עם ספירת ההזמנות הנוכחית.
 */
function updateDashboard() {
    const openOrders = allOrders.filter(order => order.סטטוס === 'פתוח' || order.סטטוס === 'ממתין/לא תקין');
    const overdueOrders = allOrders.filter(order => order.סטטוס === 'חורג');

    document.getElementById('open-orders-count').textContent = openOrders.length;
    document.getElementById('overdue-orders-count').textContent = overdueOrders.length;

    // Calculate containers in use (distinct 'מספר מכולה ירדה' from open orders)
    const containersInUseSet = new Set();
    openOrders.forEach(order => {
        if (order['מספר מכולה ירדה']) {
            containersInUseSet.add(order['מספר מכולה ירדה']);
        }
    });
    document.getElementById('containers-in-use').textContent = containersInUseSet.size;

    // Calculate active customers (distinct 'שם לקוח' from open orders)
    const activeCustomersSet = new Set();
    openOrders.forEach(order => {
        if (order['שם לקוח']) {
            activeCustomersSet.add(order['שם לקוח']);
        }
    });
    document.getElementById('active-customers-count').textContent = activeCustomersSet.size;

    // Update quick summary
    document.getElementById('summary-open').textContent = openOrders.length;
    document.getElementById('summary-overdue').textContent = overdueOrders.length;
    document.getElementById('summary-closed').textContent = allOrders.filter(order => order.סטטוס === 'סגור').length;

    // Update overdue customers badge
    document.getElementById('overdue-customers-badge').textContent = overdueOrders.length;
}

/**
 * Renders the main orders table.
 * @param {Array<Object>} ordersToRender - Filtered and/or sorted orders to display.
 * מציג את טבלת ההזמנות הראשית.
 */
function renderOrdersTable(ordersToRender) {
    const tableBody = document.querySelector('#orders-table tbody');
    tableBody.innerHTML = ''; // Clear existing rows

    const paginatedOrders = ordersToRender.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    if (paginatedOrders.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="15" class="text-center py-4 text-gray-500 dark:text-gray-400">אין הזמנות להצגה.</td></tr>`;
        updatePaginationControls(0);
        return;
    }

    paginatedOrders.forEach(order => {
        const row = tableBody.insertRow();
        row.classList.add('hover:bg-gray-100', 'dark:hover:bg-gray-700', 'transition-colors');

        // Apply row specific styling based on status and action type
        if (order.סטטוס === 'חורג') {
            row.classList.add('overdue-row');
            if (order['ימים שעברו'] && order['ימים שעברו'] > 110) {
                row.classList.add('overdue-110-days'); // For severe overdue
            }
        }
        if (order.סטטוס === 'סגור') {
            row.classList.add('closed-order-row');
        }

        // Action type based styling (background color for rows)
        if (order['סוג פעולה'] === 'הורדה') {
            row.classList.add('row-הורדה');
        } else if (order['סוג פעולה'] === 'החלפה') {
            row.classList.add('row-החלפה');
        } else if (order['סוג פעולה'] === 'העלאה') {
            row.classList.add('row-העלאה');
        }
        if (order.סטטוס === 'ממתין/לא תקין') {
            row.classList.add('row-ממתין-לא-תקין');
        }


        // Add a click listener for order details
        row.addEventListener('click', (event) => {
            // Prevent click from propagating from action buttons
            if (!event.target.closest('.action-buttons-cell')) {
                showOrderDetails(order);
            }
        });

        // Cell content
        row.insertCell().textContent = formatDate(order['תאריך הזמנה']);
        row.insertCell().innerHTML = highlightText(order['תעודה'], document.getElementById('search-input').value);
        row.insertCell().innerHTML = highlightText(order['שם סוכן'], document.getElementById('search-input').value);
        row.insertCell().innerHTML = highlightText(order['שם לקוח'], document.getElementById('search-input').value);
        row.insertCell().innerHTML = highlightText(order['כתובת'], document.getElementById('search-input').value);
        row.insertCell().textContent = order['סוג פעולה'];

        const daysOverdueCell = row.insertCell();
        daysOverdueCell.textContent = order['ימים שעברו'] || '';
        if (order.סטטוס === 'חורג' && order['ימים שעברו']) {
             daysOverdueCell.innerHTML = `<span class="overdue-days-badge">${order['ימים שעברו']} ימים</span>`;
        }

        const relatedContainersCell = row.insertCell();
        let containerHtml = '';
        if (order['מספר מכולה ירדה']) {
            containerHtml += `<span class="container-pill bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" onclick="event.stopPropagation(); openContainerHistoryModal('${order['מספר מכולה ירדה']}')">${highlightText(order['מספר מכולה ירדה'], document.getElementById('search-input').value)}</span>`;
        }
        if (order['מספר מכולה עלתה']) {
            if (order['מספר מכולה ירדה']) containerHtml += '<br>'; // New line for two containers
            containerHtml += `<span class="container-pill bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" onclick="event.stopPropagation(); openContainerHistoryModal('${order['מספר מכולה עלתה']}')">${highlightText(order['מספר מכולה עלתה'], document.getElementById('search-input').value)}</span>`;
        }
        relatedContainersCell.innerHTML = containerHtml;


        const statusCell = row.insertCell();
        statusCell.textContent = order.סטטוס;
        statusCell.classList.add(`status-${order.סטטוס.replace(/\//g, '-').replace(/\s/g, '')}`); // Add class for styling


        row.insertCell().innerHTML = highlightText(order.הערות || '', document.getElementById('search-input').value);
        row.insertCell().textContent = formatDate(order['תאריך סיום צפוי']);
        row.insertCell().innerHTML = highlightText(order['הערות סיום'] || '', document.getElementById('search-input').value);
        row.insertCell().textContent = formatDate(order['תאריך סגירה']);
        row.insertCell().textContent = order['ימים שעברו (עלתה)'] || '';

        // Action buttons cell
        const actionsCell = row.insertCell();
        actionsCell.classList.add('action-buttons-cell'); // Add a class to identify this cell
        const editButton = document.createElement('button');
        editButton.classList.add('action-btn', 'text-blue-500', 'hover:text-blue-700', 'dark:text-blue-400', 'dark:hover:text-blue-200');
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.title = 'ערוך';
        editButton.onclick = (event) => { event.stopPropagation(); openOrderModal('edit', order.sheetRow); };

        const closeButton = document.createElement('button');
        closeButton.classList.add('action-btn', 'text-green-500', 'hover:text-green-700', 'dark:text-green-400', 'dark:hover:text-green-200');
        closeButton.innerHTML = '<i class="fas fa-check-circle"></i>';
        closeButton.title = 'סגור הזמנה';
        closeButton.onclick = (event) => { event.stopPropagation(); openCloseOrderModal(order.sheetRow, order.תעודה); };
        if (order.סטטוס === 'סגור') {
            closeButton.disabled = true;
            closeButton.classList.add('opacity-50', 'cursor-not-allowed');
        }

        const deleteButton = document.createElement('button');
        deleteButton.classList.add('action-btn', 'text-red-500', 'hover:text-red-700', 'dark:text-red-400', 'dark:hover:text-red-200');
        deleteButton.innerHTML = '<i class="fas fa-trash-alt"></i>';
        deleteButton.title = 'מחק';
        deleteButton.onclick = (event) => { event.stopPropagation(); openDeleteConfirmModal(order.sheetRow, order.תעודה); };

        const duplicateButton = document.createElement('button');
        duplicateButton.classList.add('action-btn', 'text-indigo-500', 'hover:text-indigo-700', 'dark:text-indigo-400', 'dark:hover:text-indigo-200'); // Changed to indigo for branding
        duplicateButton.innerHTML = '<i class="fas fa-copy"></i>';
        duplicateButton.title = 'שכפל הזמנה';
        duplicateButton.onclick = (event) => { event.stopPropagation(); duplicateOrder(order.sheetRow); };


        actionsCell.append(editButton, closeButton, duplicateButton, deleteButton);
    });

    updatePaginationControls(ordersToRender.length);
}

/**
 * Highlights a search term within a text string.
 * @param {string} text - The original text.
 * @param {string} searchTerm - The term to highlight.
 * @returns {string} HTML string with highlighted text.
 * מדגיש מונח חיפוש בתוך מחרוזת טקסט.
 */
function highlightText(text, searchTerm) {
    if (!searchTerm) return text;
    const lowerText = text.toLowerCase();
    const lowerSearchTerm = searchTerm.toLowerCase();
    const parts = [];
    let lastIndex = 0;

    let match;
    const regex = new RegExp(escapeRegExp(lowerSearchTerm), 'gi'); // 'gi' for global and case-insensitive

    while ((match = regex.exec(lowerText)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            parts.push(text.substring(lastIndex, match.index));
        }
        // Add the highlighted match
        parts.push(`<span class="highlight bg-yellow-200 dark:bg-yellow-700 dark:text-gray-900">${text.substring(match.index, match.index + match[0].length)}</span>`);
        lastIndex = match.index + match[0].length;
    }
    // Add any remaining text after the last match
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    }
    return parts.join('');
}

/** Helper function to escape special characters in regex for highlightText */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Sorts the orders table by column.
 * @param {number} colIndex - The index of the column to sort by.
 * ממיין את טבלת ההזמנות לפי עמודה.
 */
function sortTable(colIndex) {
    // Get the actual field name based on column index
    const headerCells = document.querySelectorAll('#orders-table th');
    const fieldNameMap = {
        0: 'תאריך הזמנה',
        1: 'תעודה',
        2: 'שם סוכן',
        3: 'שם לקוח',
        4: 'כתובת',
        5: 'סוג פעולה',
        6: 'ימים שעברו',
        8: 'סטטוס',
        10: 'תאריך סיום צפוי',
        12: 'תאריך סגירה',
        13: 'ימים שעברו (עלתה)'
    };
    const fieldName = fieldNameMap[colIndex];

    if (!fieldName) {
        console.warn(`Sorting not implemented for column index ${colIndex}`);
        return;
    }

    // Determine sort direction
    if (currentSortColumn === colIndex) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = colIndex;
        currentSortDirection = 'asc';
    }

    // Clone allOrders to avoid modifying the original array directly before filtering
    let ordersToSort = [...allOrders];

    // Apply current filters before sorting
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const actionTypeFilter = document.getElementById('filter-action-type').value;

    ordersToSort = ordersToSort.filter(order => {
        const matchesSearch = searchTerm === '' ||
            (order['שם לקוח'] && order['שם לקוח'].toLowerCase().includes(searchTerm)) ||
            (order['תעודה'] && order['תעודה'].toLowerCase().includes(searchTerm)) ||
            (order['כתובת'] && order['כתובת'].toLowerCase().includes(searchTerm)) ||
            (order['מספר מכולה ירדה'] && order['מספר מכולה ירדה'].toLowerCase().includes(searchTerm)) ||
            (order['מספר מכולה עלתה'] && order['מספר מכולה עלתה'].toLowerCase().includes(searchTerm)) ||
            (order['הערות'] && order['הערות'].toLowerCase().includes(searchTerm));

        const matchesStatus = statusFilter === 'all' || order.סטטוס === statusFilter;
        const matchesActionType = actionTypeFilter === 'all' || order['סוג פעולה'] === actionTypeFilter;

        return matchesSearch && matchesStatus && matchesActionType;
    });


    ordersToSort.sort((a, b) => {
        let valA = a[fieldName];
        let valB = b[fieldName];

        // Handle specific field types for sorting
        if (fieldName.includes('תאריך')) { // Dates
            valA = valA ? new Date(valA) : (currentSortDirection === 'asc' ? new Date(0) : new Date(8640000000000000)); // Min/Max date for empty values
            valB = valB ? new Date(valB) : (currentSortDirection === 'asc' ? new Date(0) : new Date(8640000000000000));
        } else if (fieldName.includes('ימים שעברו')) { // Numbers
            valA = parseInt(valA) || 0;
            valB = parseInt(valB) || 0;
        } else { // Strings
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }

        let comparison = 0;
        if (valA > valB) comparison = 1;
        else if (valA < valB) comparison = -1;

        return currentSortDirection === 'asc' ? comparison : -comparison;
    });

    renderOrdersTable(ordersToSort);

    // Update sort icons
    headerCells.forEach((th, index) => {
        const icon = th.querySelector('i.fa-sort, i.fa-sort-up, i.fa-sort-down');
        if (icon) {
            icon.classList.remove('fa-sort-up', 'fa-sort-down');
            if (index === currentSortColumn) {
                icon.classList.add(currentSortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down');
            } else {
                icon.classList.add('fa-sort');
            }
        }
    });
}


/**
 * Updates pagination controls.
 * @param {number} totalRows - Total number of rows after filtering.
 * מעדכן את פקדי העמודים.
 */
function updatePaginationControls(totalRows) {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    document.getElementById('page-info').textContent = `עמוד ${currentPage} מתוך ${totalPages || 1}`;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
}

/**
 * Changes the current page in the table.
 * @param {number} direction - -1 for previous page, 1 for next page.
 * משנה את העמוד הנוכחי בטבלה.
 */
function changePage(direction) {
    const totalPages = Math.ceil(allOrders.length / rowsPerPage); // Use allOrders for total pages
    const currentOrders = filterAndSearchOrders(); // Get currently filtered/searched orders

    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    renderOrdersTable(currentOrders);
}

/**
 * Helper function to format date strings.
 * @param {string} dateInput - The date string to format.
 * @returns {string} Formatted date (DD/MM/YYYY) or empty string if invalid.
 * פונקציית עזר לעיצוב מחרוזות תאריך.
 */
function formatDate(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return ''; // Check for invalid date

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Helper function to format date-time strings.
 * @param {string} dateTimeString - The date-time string to format.
 * @returns {string} Formatted date-time (DD/MM/YYYY HH:MM) or empty string if invalid.
 * פונקציית עזר לעיצוב מחרוזות תאריך-שעה.
 */
function formatDateTime(dateTimeString) {
    if (!dateTimeString) return '';
    const date = new Date(dateTimeString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}


/**
 * Opens the add/edit order modal.
 * @param {string} mode - 'add' or 'edit'.
 * @param {number} [sheetRow] - The row number in the Google Sheet for editing.
 * פותח את חלון המודאל להוספה/עריכת הזמנה.
 */
function openOrderModal(mode, sheetRow) {
    const modal = document.getElementById('order-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('order-form');

    // Add mobile-drawer class if on mobile
    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');

    form.reset(); // Clear form fields
    handleActionTypeChange(); // Reset visibility of container fields

    if (mode === 'add') {
        title.textContent = 'הוסף הזמנה חדשה';
        form.onsubmit = (event) => { event.preventDefault(); addOrder(); };
        document.getElementById('תאריך הזמנה').valueAsDate = new Date(); // Set current date
        document.getElementById('תאריך וזמן עדכון הערה').value = formatDateTime(new Date()).replace(' ', 'T'); // Set current date and time
        currentEditingOrder = null;
    } else if (mode === 'edit' && sheetRow) {
        title.textContent = 'ערוך הזמנה קיימת';
        const orderToEdit = allOrders.find(order => order.sheetRow === sheetRow);
        if (orderToEdit) {
            currentEditingOrder = orderToEdit; // Store the order being edited
            // Populate form fields
            for (const key in orderToEdit) {
                const input = document.getElementById(key);
                if (input) {
                    if (input.type === 'date') {
                        input.value = orderToEdit[key]; // Date string from sheet matches HTML date input format
                    } else if (input.type === 'datetime-local') {
                         input.value = orderToEdit[key] ? new Date(orderToEdit[key]).toISOString().slice(0, 16) : '';
                    }
                    else {
                        input.value = orderToEdit[key];
                    }
                }
            }
            handleActionTypeChange(); // Adjust container fields based on loaded action type
            form.onsubmit = (event) => { event.preventDefault(); editOrder(sheetRow); };
        } else {
            showAlert('שגיאה: הזמנה לעריכה לא נמצאה.', 'error');
            closeOrderModal();
            return;
        }
    }

    // Initialize autocompletes for all relevant fields
    autocomplete(document.getElementById('שם לקוח'), 'שם לקוח');
    autocomplete(document.getElementById('כתובת'), 'כתובת');
    autocomplete(document.getElementById('תעודה'), 'תעודה');
    autocomplete(document.getElementById('שם סוכן'), 'שם סוכן');
    autocomplete(document.getElementById('מספר מכולה ירדה'), 'מספר מכולה ירדה');
    autocomplete(document.getElementById('מספר מכולה עלתה'), 'מספר מכולה עלתה');
}

/**
 * Closes the order modal.
 * סוגר את חלון מודאל ההזמנה.
 */
function closeOrderModal() {
    document.getElementById('order-modal').classList.remove('active');
    document.getElementById('order-form').reset();
    currentEditingOrder = null;
    // Clear autocomplete lists
    document.querySelectorAll('.autocomplete-items').forEach(list => list.remove());
}

/**
 * Adds a predefined note to the notes textarea.
 * מוסיף הערה מוגדרת מראש לשדה הטקסט של ההערות.
 */
function addPredefinedNote() {
    const select = document.getElementById('predefined-notes');
    const notesTextarea = document.getElementById('הערות');
    if (select.value) {
        notesTextarea.value = notesTextarea.value ? notesTextarea.value + '\n' + select.value : select.value;
        select.value = ""; // Reset select after adding
    }
}

/**
 * Checks if a customer (name + address) already exists and offers to autofill.
 * בודק אם לקוח (שם + כתובת) כבר קיים ומציע למלא פרטים באופן אוטומטי.
 */
async function checkCustomerExistenceAndAutofill() {
    const customerName = document.getElementById('שם לקוח').value;
    const customerAddress = document.getElementById('כתובת').value;

    if (!customerName || !customerAddress) return;

    // Find the latest order for this customer name and address combination
    const matchingOrders = allOrders.filter(order =>
        order['שם לקוח'] === customerName && order['כתובת'] === customerAddress
    ).sort((a, b) => new Date(b['תאריך הזמנה']) - new Date(a['תאריך הזמנה'])); // Sort descending by date

    if (matchingOrders.length > 0) {
        autofillData = matchingOrders[0]; // Store the latest matching order for autofill
        document.getElementById('autofill-confirm-modal').classList.add('active');
        if (isMobile()) {
            document.getElementById('autofill-confirm-modal').classList.add('mobile-drawer');
        } else {
            document.getElementById('autofill-confirm-modal').classList.remove('mobile-drawer');
        }
    } else {
        autofillData = null;
    }
}

/**
 * Confirms or denies autofill operation.
 * @param {boolean} confirm - True to autofill, false otherwise.
 * מאשר או מבטל פעולת מילוי אוטומטי.
 */
function confirmAutofill(confirm) {
    if (confirm && autofillData) {
        // Only autofill relevant fields, not date or action type
        const fieldsToAutofill = ['תעודה', 'שם סוכן', 'מספר מכולה ירדה', 'מספר מכולה עלתה', 'הערות'];
        fieldsToAutofill.forEach(field => {
            const input = document.getElementById(field);
            if (input && autofillData[field]) {
                input.value = autofillData[field];
            }
        });
        showAlert('פרטי לקוח מולאו אוטומטית בהצלחה!', 'success');
    }
    hideAutofillConfirmModal();
}

/**
 * Hides the autofill confirmation modal.
 * מסתיר את חלון המודאל של אישור המילוי האוטומטי.
 */
function hideAutofillConfirmModal() {
    document.getElementById('autofill-confirm-modal').classList.remove('active');
    autofillData = null;
}

/**
 * Dynamically shows/hides container input fields based on "סוג פעולה".
 * מציג/מסתיר באופן דינמי שדות קלט למספרי מכולות בהתאם ל"סוג פעולה".
 */
function handleActionTypeChange() {
    const actionType = document.getElementById('סוג פעולה').value;
    const containerTakenDiv = document.getElementById('container-taken-div');
    const containerBroughtDiv = document.getElementById('container-brought-div');
    const containerTakenInput = document.getElementById('מספר מכולה ירדה');
    const containerBroughtInput = document.getElementById('מספר מכולה עלתה');

    // Reset required state and clear values
    containerTakenInput.required = false;
    containerBroughtInput.required = false;
    containerTakenInput.value = '';
    containerBroughtInput.value = '';

    switch (actionType) {
        case 'הורדה':
            containerTakenDiv.classList.remove('hidden');
            containerBroughtDiv.classList.add('hidden');
            containerTakenInput.required = true;
            break;
        case 'העלאה':
            containerTakenDiv.classList.remove('hidden'); // This is for 'returned' container
            containerBroughtDiv.classList.add('hidden');
            containerTakenInput.required = true;
            break;
        case 'החלפה':
            containerTakenDiv.classList.remove('hidden');
            containerBroughtDiv.classList.remove('hidden');
            containerTakenInput.required = true;
            containerBroughtInput.required = true;
            break;
        default:
            containerTakenDiv.classList.add('hidden');
            containerBroughtDiv.classList.add('hidden');
            break;
    }
}

/**
 * Collects form data and sends a request to add a new order.
 * אוסף נתונים מהטופס ושולח בקשה להוספת הזמנה חדשה.
 */
async function addOrder() {
    const form = document.getElementById('order-form');
    // const formData = new FormData(form); // Use FormData if sending actual files
    const orderData = {};

    // Get all form fields by their 'name' attribute
    form.querySelectorAll('[name]').forEach(input => {
        if (input.type === 'file') {
            // Handle files separately or warn that direct file upload needs server support
            if (input.files.length > 0) {
                // For direct Apps Script, you'd usually convert to base64 or upload to Drive separately.
                // For simplicity here, we'll just acknowledge the file input.
                // Actual file upload needs backend support, which is beyond this script's scope without server-side logic.
                showAlert('העלאת קבצים דורשת הטמעת צד שרת נוסף עבור ניהול קבצים (כמו Google Drive)!', 'info', 5000);
            }
        } else {
            orderData[input.name] = input.value;
        }
    });

    try {
        const response = await fetchData('addOrder', orderData);
        if (response && response.status === 'success') {
            showAlert('הזמנה נוספה בהצלחה!', 'success');
            closeOrderModal();
            loadOrders(); // Reload data to update tables and dashboards
        } else {
            showAlert('שגיאה בהוספת הזמנה: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}

/**
 * Collects updated form data and sends a request to edit an existing order.
 * @param {number} sheetRow - The row number of the order in the Google Sheet.
 * אוסף נתונים מעודכנים מהטופס ושולח בקשה לעריכת הזמנה קיימת.
 */
async function editOrder(sheetRow) {
    const form = document.getElementById('order-form');
    // const formData = new FormData(form); // Use FormData if sending actual files
    const orderData = { sheetRow: sheetRow };

    form.querySelectorAll('[name]').forEach(input => {
        if (input.type === 'file') {
             if (input.files.length > 0) {
                showAlert('העלאת קבצים דורשת הטמעת צד שרת נוסף עבור ניהול קבצים (כמו Google Drive)!', 'info', 5000);
            }
        } else {
            orderData[input.name] = input.value;
        }
    });

    try {
        const response = await fetchData('editOrder', orderData);
        if (response && response.status === 'success') {
            showAlert('הזמנה עודכנה בהצלחה!', 'success');
            closeOrderModal();
            loadOrders(); // Reload data
        } else {
            showAlert('שגיאה בעדכון הזמנה: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}

/**
 * Opens the close order modal.
 * @param {number} sheetRow - The row number of the order.
 * @param {string} orderId - The document ID of the order.
 * פותח את חלון המודאל לסגירת הזמנה.
 */
function openCloseOrderModal(sheetRow, orderId) {
    const modal = document.getElementById('close-order-modal');
    document.getElementById('close-order-id').textContent = orderId;
    document.getElementById('confirm-close-btn').onclick = () => confirmCloseOrder(sheetRow);
    document.getElementById('close-notes').value = ''; // Clear previous notes

     if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the close order modal.
 * סוגר את חלון המודאל לסגירת הזמנה.
 */
function closeCloseOrderModal() {
    document.getElementById('close-order-modal').classList.remove('active');
}

/**
 * Confirms and executes closing an order.
 * @param {number} sheetRow - The row number of the order.
 * מאשר ומבצע סגירת הזמנה.
 */
async function confirmCloseOrder(sheetRow) {
    const closeNotes = document.getElementById('close-notes').value;
    try {
        const response = await fetchData('closeOrder', { sheetRow: sheetRow, closeNotes: closeNotes });
        if (response && response.status === 'success') {
            showAlert('הזמנה נסגרה בהצלחה!', 'success');
            closeCloseOrderModal();
            loadOrders();
        } else {
            showAlert('שגיאה בסגירת הזמנה: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}

/**
 * Opens the delete confirmation modal.
 * @param {number} sheetRow - The row number of the order.
 * @param {string} orderId - The document ID of the order.
 * פותח את חלון המודאל לאישור מחיקה.
 */
function openDeleteConfirmModal(sheetRow, orderId) {
    const modal = document.getElementById('delete-confirm-modal');
    document.getElementById('delete-order-id').textContent = orderId;
    document.getElementById('confirm-delete-btn').onclick = () => deleteOrder(sheetRow);

    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the delete confirmation modal.
 * סוגר את חלון המודאל לאישור מחיקה.
 */
function closeDeleteConfirmModal() {
    document.getElementById('delete-confirm-modal').classList.remove('active');
}

/**
 * Deletes an order from the sheet.
 * @param {number} sheetRow - The row number of the order to delete.
 * מוחק הזמנה מהגיליון.
 */
async function deleteOrder(sheetRow) {
    try {
        const response = await fetchData('deleteOrder', { sheetRow: sheetRow });
        if (response && response.status === 'success') {
            showAlert('הזמנה נמחקה בהצלחה!', 'success');
            closeDeleteConfirmModal();
            loadOrders(); // Reload data
        } else {
            showAlert('שגיאה במחיקת הזמנה: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}

/**
 * Duplicates an existing order.
 * @param {number} sheetRow - The row number of the order to duplicate.
 * משכפל הזמנה קיימת.
 */
async function duplicateOrder(sheetRow) {
    try {
        const orderToDuplicate = allOrders.find(order => order.sheetRow === sheetRow);
        if (!orderToDuplicate) {
            showAlert('שגיאה: הזמנה לשכפול לא נמצאה.', 'error');
            return;
        }

        const newOrderData = { ...orderToDuplicate };
        delete newOrderData.sheetRow; // Remove sheetRow for new entry
        newOrderData.סטטוס = 'פתוח'; // New duplicated order is open
        newOrderData['תאריך סגירה'] = ''; // Clear closed date
        newOrderData['הערות סיום'] = ''; // Clear end notes
        newOrderData['ימים שעברו (עלתה)'] = ''; // Clear days passed (returned)
        newOrderData['תאריך הזמנה'] = formatDate(new Date()); // Set current date for duplicated order
        newOrderData['תאריך וזמן עדכון הערה'] = formatDateTime(new Date()); // Set current date/time for notes

        const response = await fetchData('addOrder', newOrderData); // Add as a new order
        if (response && response.status === 'success') {
            showAlert('הזמנה שוכפלה בהצלחה!', 'success');
            loadOrders(); // Reload data
        } else {
            showAlert('שגיאה בשכפול הזמנה: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error already handled by fetchData's showAlert
    }
}


/**
 * Filters the orders table based on search input, status, and action type dropdowns.
 * מסנן את טבלת ההזמנות לפי קלט חיפוש, סטטוס וסוג פעולה.
 */
function filterTable() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const actionTypeFilter = document.getElementById('filter-action-type').value;

    const filteredOrders = allOrders.filter(order => {
        const matchesSearch = searchTerm === '' ||
            (order['שם לקוח'] && order['שם לקוח'].toLowerCase().includes(searchTerm)) ||
            (order['תעודה'] && order['תעודה'].toLowerCase().includes(searchTerm)) ||
            (order['כתובת'] && order['כתובת'].toLowerCase().includes(searchTerm)) ||
            (order['מספר מכולה ירדה'] && order['מספר מכולה ירדה'].toLowerCase().includes(searchTerm)) ||
            (order['מספר מכולה עלתה'] && order['מספר מכולה עלתה'].toLowerCase().includes(searchTerm)) ||
            (order['הערות'] && order['הערות'].toLowerCase().includes(searchTerm));

        const matchesStatus = statusFilter === 'all' || order.סטטוס === statusFilter;
        const matchesActionType = actionTypeFilter === 'all' || order['סוג פעולה'] === actionTypeFilter;

        return matchesSearch && matchesStatus && matchesActionType;
    });

    currentPage = 1; // Reset to first page after filtering
    renderOrdersTable(filteredOrders);
}

/**
 * Resets all search and filter inputs and re-applies the filter.
 * מאפס את כל כניסות החיפוש והסינון ומחיל מחדש את המסנן.
 */
function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-action-type').value = 'all';
    filterTable(); // Re-apply filters which will show all data
}

/**
 * Checks for various alerts (duplicate document IDs, active orders, overdue orders).
 * @param {Array<Object>} orders - The array of all order objects.
 * בודק התראות שונות (כפילויות של מספרי תעודה, הזמנות פעילות, הזמנות חורגות).
 */
function checkAlerts(orders) {
    const activeOrders = orders.filter(order => order.סטטוס === 'פתוח' || order.סטטוס === 'ממתין/לא תקין' || order.סטטוס === 'חורג');

    const customerAddressMap = new Map(); // Key: "CustomerName_Address", Value: array of orders
    const docIdMap = new Map(); // Key: docId, Value: array of orders
    const containerInUseMap = new Map(); // Key: containerNum, Value: array of active orders

    activeOrders.forEach(order => {
        const customerAddressKey = `${order['שם לקוח']}_${order['כתובת']}`;
        if (!customerAddressMap.has(customerAddressKey)) {
            customerAddressMap.set(customerAddressKey, []);
        }
        customerAddressMap.get(customerAddressKey).push(order);

        if (!docIdMap.has(order['תעודה'])) {
            docIdMap.set(order['תעודה'], []);
        }
        docIdMap.get(order['תעודה']).push(order);

        if (order['מספר מכולה ירדה']) {
            if (!containerInUseMap.has(order['מספר מכולה ירדה'])) {
                containerInUseMap.set(order['מספר מכולה ירדה'], []);
            }
            containerInUseMap.get(order['מספר מכולה ירדה']).push(order);
        }
    });

    // Check for multiple active orders for the same customer/address
    customerAddressMap.forEach((ordersArr, key) => {
        if (ordersArr.length > 1) {
            showAlert(`ישנם ${ordersArr.length} הזמנות פעילות עבור הלקוח: ${ordersArr[0]['שם לקוח']}, כתובת: ${ordersArr[0]['כתובת']}`, 'warning', 7000);
        }
    });

    // Check for duplicate document IDs
    docIdMap.forEach((ordersArr, docId) => {
        if (ordersArr.length > 1) {
            showAlert(`זוהו ${ordersArr.length} הזמנות עם אותו מספר תעודה: ${docId}`, 'error', 10000);
        }
    });

    // Check for containers used in multiple active orders
    containerInUseMap.forEach((ordersArr, containerNum) => {
        if (ordersArr.length > 1) {
            showAlert(`מכולה מספר ${containerNum} משויכת למספר הזמנות פעילות!`, 'error', 10000);
        }
    });

    // Check for upcoming overdue orders (e.g., due in next 7 days)
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const upcomingOverdue = orders.filter(order =>
        order.סטטוס === 'פתוח' &&
        order['תאריך סיום צפוי'] &&
        new Date(order['תאריך סיום צפוי']) <= sevenDaysFromNow &&
        new Date(order['תאריך סיום צפוי']) >= today
    );

    upcomingOverdue.forEach(order => {
        showAlert(`הזמנה מספר ${order.תעודה} ללקוח ${order['שם לקוח']} עומדת לחרוג בתאריך ${formatDate(order['תאריך סיום צפוי'])}!`, 'warning', 7000);
    });

    // Update notification bell count
    const notificationCount = document.getElementById('notification-count');
    // For this example, let's make it reflect *all* current warnings/errors
    const totalAlerts = document.getElementById('alert-container').children.length; // Count visible alerts
    if (totalAlerts > 0) {
        notificationCount.textContent = totalAlerts;
        notificationCount.style.display = 'flex'; // Show the badge
    } else {
        notificationCount.style.display = 'none'; // Hide the badge
    }
}

/**
 * Renders the Containers by Customer bar chart using D3.js.
 * @param {Array<Object>} orders - The array of all order objects.
 * מציג את תרשים העמודות של מכולות לפי לקוח באמצעות D3.js.
 */
function drawContainersByCustomerChart(orders) {
    const chartData = {};
    orders.filter(order => order.סטטוס !== 'סגור' && order['מספר מכולה ירדה']).forEach(order => {
        const customerName = order['שם לקוח'];
        if (!chartData[customerName]) {
            chartData[customerName] = new Set();
        }
        chartData[customerName].add(order['מספר מכולה ירדה']); // Count unique containers per customer
    });

    const finalChartData = Object.keys(chartData).map(customer => ({
        customer: customer,
        count: chartData[customer].size
    })).sort((a, b) => b.count - a.count); // Sort by count descending

    const container = d3.select("#chart-containers-by-customer");
    container.select("svg").remove(); // Clear previous chart

    const margin = { top: 20, right: 30, bottom: 80, left: 60 };
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = Math.min(400, finalChartData.length * 40 + margin.top + margin.bottom); // Adjust height dynamically

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .range([0, width])
        .domain(finalChartData.map(d => d.customer))
        .padding(0.1);

    const y = d3.scaleLinear()
        .range([height, 0])
        .domain([0, d3.max(finalChartData, d => d.count) + 1]);

    svg.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "translate(-10,0)rotate(-45)")
        .style("text-anchor", "end")
        .attr("class", "chart-text dark:fill-gray-300");

    svg.append("g")
        .call(d3.axisLeft(y).ticks(d3.max(finalChartData, d => d.count) + 1).tickFormat(d3.format("d")))
        .attr("class", "chart-text dark:fill-gray-300");

    svg.selectAll(".bar")
        .data(finalChartData)
        .enter().append("rect")
        .attr("class", "chart-bar fill-indigo-500 hover:fill-indigo-700 dark:fill-indigo-400 dark:hover:fill-indigo-200")
        .attr("x", d => x(d.customer))
        .attr("y", d => y(d.count))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.count))
        .on("mouseover", function(event, d) {
            d3.select(this).classed("hovered", true);
            svg.append("text")
                .attr("class", "tooltip-text dark:fill-gray-100")
                .attr("x", x(d.customer) + x.bandwidth() / 2)
                .attr("y", y(d.count) - 5)
                .attr("text-anchor", "middle")
                .text(d.count);
        })
        .on("mouseout", function() {
            d3.select(this).classed("hovered", false);
            svg.selectAll(".tooltip-text").remove();
        });
}

/**
 * Renders the Status Pie Chart using D3.js.
 * @param {Array<Object>} orders - The array of all order objects.
 * מציג את תרשים העוגה של סטטוסים באמצעות D3.js.
 */
function drawStatusPieChart(orders) {
    const statusCounts = d3.rollup(orders, v => v.length, d => d.סטטוס);
    const data = Array.from(statusCounts, ([status, count]) => ({ status, count }));

    const container = d3.select("#chart-status-pie");
    container.select("svg").remove(); // Clear previous chart

    const width = container.node().getBoundingClientRect().width;
    const height = Math.min(400, width * 0.7); // Adjust height based on width for responsiveness
    const radius = Math.min(width, height) / 2;

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    const color = d3.scaleOrdinal()
        .domain(data.map(d => d.status))
        .range(["#6366F1", "#06B6D4", "#EF4444", "#F59E0B", "#22C55E", "#475569"]); // Indigo, Cyan, Red, Amber, Green, Slate

    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);

    const arc = d3.arc()
        .innerRadius(radius * 0.6) // Donut chart
        .outerRadius(radius);

    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);

    svg.selectAll('arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'pie-slice')
        .append('path')
        .attr('d', arc)
        .attr('fill', d => color(d.data.status))
        .attr('stroke', document.body.classList.contains('dark') ? '#0F172A' : '#FFFFFF') // Border between slices
        .style('stroke-width', '2px')
        .transition()
        .duration(750)
        .attrTween('d', function(d) {
            const i = d3.interpolate(d.startAngle + 0.1, d.endAngle);
            return function(t) {
                d.endAngle = i(t);
                return arc(d);
            };
        })
        .end()
        .then(() => {
            // Add labels and polylines after animation
            svg.selectAll('.pie-slice')
                .append('text')
                .attr('transform', d => `translate(${outerArc.centroid(d)})`)
                .attr('dy', '0.35em')
                .style('text-anchor', d => {
                    const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                    return (midangle < Math.PI / 2 || midangle > 3 * Math.PI / 2) ? 'start' : 'end';
                })
                .attr('class', 'legend-text fill-gray-900 dark:fill-gray-100 font-semibold text-xs') // Tailwind classes
                .text(d => `${d.data.status} (${d.data.count})`)
                .on('click', function(event, d) {
                    filterTableByStatus(d.data.status);
                    showAlert(`מסנן לפי סטטוס: ${d.data.status}`, 'info');
                });

            svg.selectAll('.pie-slice')
                .append('polyline')
                .attr('points', d => {
                    const posA = arc.centroid(d);
                    const posB = outerArc.centroid(d);
                    const posC = outerArc.centroid(d);
                    const midangle = d.startAngle + (d.endAngle - d.startAngle) / 2;
                    posC[0] = radius * 0.95 * (midangle < Math.PI ? 1 : -1);
                    return [posA, posB, posC];
                })
                .style('fill', 'none')
                .style('stroke', '#64748B')
                .style('stroke-width', '1px');
        });

    // Add legend if space permits
    if (width > 500) {
        const legend = svg.selectAll(".legend")
            .data(color.domain())
            .enter().append("g")
            .attr("class", "legend")
            .attr("transform", (d, i) => `translate(${width / 2 - 100},${i * 20 - height / 2 + 20})`); // Position legend

        legend.append("rect")
            .attr("x", 0)
            .attr("width", 18)
            .attr("height", 18)
            .attr("fill", color);

        legend.append("text")
            .attr("x", 24)
            .attr("y", 9)
            .attr("dy", ".35em")
            .attr("class", "legend-text fill-gray-700 dark:fill-gray-300")
            .text(d => d);
    }
}

/**
 * Filters the main table by status from the pie chart.
 * @param {string} status - The status to filter by.
 * מסנן את הטבלה הראשית לפי סטטוס מתרשים העוגה.
 */
function filterTableByStatus(status) {
    document.getElementById('filter-status').value = status;
    filterTable();
    showPage('dashboard'); // Ensure dashboard is visible after filtering from chart
}

/**
 * Draws all dashboard charts.
 * @param {Array<Object>} orders - The array of all order objects.
 * מציג את כל תרשימי הדאשבורד.
 */
function drawCharts(orders) {
    drawContainersByCustomerChart(orders);
    drawStatusPieChart(orders);
}

/**
 * Toggles fullscreen mode for a chart.
 * @param {string} chartId - The ID of the chart container.
 * מחליף מצב מסך מלא עבור תרשים.
 */
function toggleFullscreen(chartId) {
    const chartContainer = document.getElementById(chartId);
    chartContainer.classList.toggle('chart-fullscreen');
    // Re-draw charts to adjust to new dimensions
    drawCharts(allOrders);
}

/**
 * Exports the currently displayed table data to a CSV file.
 * מייצא את נתוני הטבלה המוצגים לקובץ CSV.
 */
function exportToExcel() {
    const table = document.getElementById('orders-table');
    let csv = [];
    // Get headers
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim().replace('i', '').trim()); // Remove icon text
    csv.push(headers.join(','));

    // Get rows, filter out action buttons
    table.querySelectorAll('tbody tr').forEach(row => {
        let rowData = Array.from(row.querySelectorAll('td'))
            .filter(cell => !cell.classList.contains('action-buttons-cell')) // Exclude action buttons cell
            .map(cell => {
                let text = cell.textContent.trim();
                // If the cell contains container pills, get the text content of each pill
                if (cell.querySelector('.container-pill')) {
                    text = Array.from(cell.querySelectorAll('.container-pill')).map(pill => pill.textContent.trim()).join(' / ');
                }
                // Handle commas within cell data
                return `"${text.replace(/"/g, '""')}"`;
            });
        csv.push(rowData.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csv.join('\n'); // Add UTF-8 BOM
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'orders_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showAlert('הטבלה יוצאה לאקסל בהצלחה!', 'success');
}


/**
 * Prints the current table view.
 * מדפיס את תצוגת הטבלה הנוכחית.
 */
function printTable() {
    window.print();
    showAlert('הטבלה נשלחה להדפסה!', 'info');
}

/**
 * Opens the modal displaying overdue customers.
 * פותח את חלון המודאל המציג לקוחות חורגים.
 */
async function openOverdueCustomersModal() {
    const modal = document.getElementById('overdue-customers-modal');
    const tableBody = document.querySelector('#overdue-customers-table tbody');
    tableBody.innerHTML = '';
    const noOverdueMsg = document.getElementById('no-overdue-customers');
    noOverdueMsg.classList.add('hidden');

    // Filter only overdue orders
    const overdueOrders = allOrders.filter(order => order.סטטוס === 'חורג');

    if (overdueOrders.length === 0) {
        noOverdueMsg.classList.remove('hidden');
    } else {
        overdueOrders.forEach(order => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = order['שם לקוח'];
            row.insertCell().textContent = order['תעודה'];
            row.insertCell().textContent = order['כתובת'];
            row.insertCell().textContent = order['ימים שעברו'] || '';
            const containersCell = row.insertCell();
            let containerHtml = '';
            if (order['מספר מכולה ירדה']) {
                containerHtml += `<span class="container-pill bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" onclick="event.stopPropagation(); openContainerHistoryModal('${order['מספר מכולה ירדה']}')">${order['מספר מכולה ירדה']}</span>`;
            }
            if (order['מספר מכולה עלתה']) {
                if (order['מספר מכולה ירדה']) containerHtml += '<br>';
                containerHtml += `<span class="container-pill bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" onclick="event.stopPropagation(); openContainerHistoryModal('${order['מספר מכולה עלתה']}')">${order['מספר מכולה עלתה']}</span>`;
            }
            containersCell.innerHTML = containerHtml;
            row.insertCell().textContent = order.הערות || '';
        });
    }

    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the overdue customers modal.
 * סוגר את חלון המודאל של לקוחות חורגים.
 */
function closeOverdueCustomersModal() {
    document.getElementById('overdue-customers-modal').classList.remove('active');
}

/**
 * Displays detailed information about a selected order in a modal.
 * @param {object} orderData - The order object to display.
 * מציג מידע מפורט על הזמנה נבחרת בחלון מודאל.
 */
function showOrderDetails(orderData) {
    const modal = document.getElementById('order-details-modal');
    const detailsCard = document.getElementById('current-order-card');
    detailsCard.innerHTML = `
        <h3 class="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">פרטי הזמנה: ${orderData['תעודה']}</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-700 dark:text-gray-300 text-base">
            <p><strong>תאריך הזמנה:</strong> ${formatDate(orderData['תאריך הזמנה'])}</p>
            <p><strong>שם סוכן:</strong> ${orderData['שם סוכן']}</p>
            <p><strong>שם לקוח:</strong> ${orderData['שם לקוח']}</p>
            <p><strong>כתובת:</strong> ${orderData['כתובת']}</p>
            <p><strong>סוג פעולה:</strong> ${orderData['סוג פעולה']}</p>
            ${orderData['מספר מכולה ירדה'] ? `<p><strong>מכולה ירדה:</strong> <span class="container-pill bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 cursor-pointer" onclick="event.stopPropagation(); openContainerHistoryModal('${orderData['מספר מכולה ירדה']}')">${orderData['מספר מכולה ירדה']}</span></p>` : ''}
            ${orderData['מספר מכולה עלתה'] ? `<p><strong>מכולה עלתה:</strong> <span class="container-pill bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300 cursor-pointer" onclick="event.stopPropagation(); openContainerHistoryModal('${orderData['מספר מכולה עלתה']}')">${orderData['מספר מכולה עלתה']}</span></p>` : ''}
            <p><strong>תאריך סיום צפוי:</strong> ${formatDate(orderData['תאריך סיום צפוי'])}</p>
            <p><strong>סטטוס:</strong> <span class="status-${orderData.סטטוס.replace(/\//g, '-').replace(/\s/g, '')}">${orderData.סטטוס}</span></p>
            <p><strong>ימים שעברו:</strong> ${orderData['ימים שעברו'] || '-'}</p>
            <p><strong>הערות:</strong> ${orderData.הערות || '-'}</p>
            <p><strong>תאריך וזמן עדכון הערה:</strong> ${formatDateTime(orderData['תאריך וזמן עדכון הערה'])}</p>
            <p><strong>תאריך סגירה:</strong> ${formatDate(orderData['תאריך סגירה'])}</p>
            <p><strong>הערות סיום:</strong> ${orderData['הערות סיום'] || '-'}</p>
        </div>
    `;

    // Populate customer history
    renderCustomerHistoryTable(orderData['שם לקוח'], orderData['כתובת']);
    // Reset history section toggle
    document.getElementById('history-section-toggle').classList.remove('expanded');
    document.getElementById('history-toggle-text').textContent = 'הצג היסטוריית לקוח';
    document.getElementById('history-section-toggle').querySelector('i').classList.remove('fa-chevron-up');
    document.getElementById('history-section-toggle').querySelector('i').classList.add('fa-chevron-down');
    document.getElementById('customer-history-section').classList.add('hidden'); // Ensure it's hidden initially

    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the order details modal.
 * סוגר את חלון מודאל פרטי ההזמנה.
 */
function closeOrderDetailsModal() {
    document.getElementById('order-details-modal').classList.remove('active');
}

/**
 * Toggles the visibility of the customer history section in order details.
 * מחליף את נראות החלק של היסטוריית הלקוח בפרטי ההזמנה.
 */
function toggleCustomerHistorySection() {
    const historySection = document.getElementById('customer-history-section');
    const toggleButton = document.getElementById('history-section-toggle');
    const toggleText = document.getElementById('history-toggle-text');
    const toggleIcon = toggleButton.querySelector('i');

    if (historySection.classList.contains('hidden')) {
        historySection.classList.remove('hidden');
        toggleButton.classList.add('expanded');
        toggleText.textContent = 'הסתר היסטוריית לקוח';
        toggleIcon.classList.remove('fa-chevron-down');
        toggleIcon.classList.add('fa-chevron-up');
    } else {
        historySection.classList.add('hidden');
        toggleButton.classList.remove('expanded');
        toggleText.textContent = 'הצג היסטוריית לקוח';
        toggleIcon.classList.remove('fa-chevron-up');
        toggleIcon.classList.add('fa-chevron-down');
    }
}

/**
 * Renders the customer history table within the order details modal.
 * @param {string} customerName - The name of the customer.
 * @param {string} customerAddress - The address of the customer.
 * מציג את טבלת היסטוריית הלקוח בתוך חלון מודאל פרטי ההזמנה.
 */
function renderCustomerHistoryTable(customerName, customerAddress) {
    const historyTableBody = document.querySelector('#customer-history-table tbody');
    historyTableBody.innerHTML = '';
    const noHistoryMsg = document.getElementById('no-customer-history');
    noHistoryMsg.classList.add('hidden');

    const customerHistoryOrders = allOrders.filter(order =>
        order['שם לקוח'] === customerName && order['כתובת'] === customerAddress
    ).sort((a, b) => new Date(b['תאריך הזמנה']) - new Date(a['תאריך הזמנה'])); // Sort by date descending

    if (customerHistoryOrders.length === 0) {
        noHistoryMsg.classList.remove('hidden');
    } else {
        customerHistoryOrders.forEach(order => {
            const row = historyTableBody.insertRow();
            row.insertCell().textContent = formatDate(order['תאריך הזמנה']);
            row.insertCell().textContent = order['תעודה'];
            row.insertCell().textContent = order['סוג פעולה'];
            row.insertCell().textContent = order['מספר מכולה ירדה'] || '-';
            row.insertCell().textContent = order['מספר מכולה עלתה'] || '-';
            row.insertCell().textContent = order.סטטוס;
            row.insertCell().textContent = order['ימים שעברו'] || '-';
            row.insertCell().textContent = formatDate(order['תאריך סגירה']);
        });
    }
}

/**
 * Opens the modal displaying the history of a specific container.
 * @param {string} containerNum - The container number.
 * פותח את חלון המודאל המציג את היסטוריית מכולה ספציפית.
 */
function openContainerHistoryModal(containerNum) {
    const modal = document.getElementById('container-history-modal');
    document.getElementById('history-container-number').textContent = containerNum;
    const tableBody = document.querySelector('#container-history-table tbody');
    tableBody.innerHTML = '';
    const noHistoryMsg = document.getElementById('no-container-history');
    noHistoryMsg.classList.add('hidden');

    const containerHistory = allOrders.filter(order =>
        order['מספר מכולה ירדה'] === containerNum || order['מספר מכולה עלתה'] === containerNum
    ).sort((a, b) => new Date(b['תאריך הזמנה']) - new Date(a['תאריך הזמנה']));

    if (containerHistory.length === 0) {
        noHistoryMsg.classList.remove('hidden');
    } else {
        containerHistory.forEach(order => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = formatDate(order['תאריך הזמנה']);
            row.insertCell().textContent = order['תעודה'];
            row.insertCell().textContent = order['שם לקוח'];
            row.insertCell().textContent = order['סוג פעולה'];
            row.insertCell().textContent = order['מספר מכולה ירדה'] || '-';
            row.insertCell().textContent = order['מספר מכולה עלתה'] || '-';
            row.insertCell().textContent = order.סטטוס;
            row.insertCell().textContent = formatDate(order['תאריך סיום צפוי']);
        });
    }

    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the container history modal.
 * סוגר את חלון המודאל של היסטוריית המכולה.
 */
function closeContainerHistoryModal() {
    document.getElementById('container-history-modal').classList.remove('active');
}

/**
 * Updates the container inventory page with "In Use" and "Available" containers.
 * מעדכן את עמוד מלאי המכולות עם מכולות "בשימוש" ו"זמינות".
 */
function updateContainerInventory() {
    const containersInUseTableBody = document.querySelector('#containers-in-use-table tbody');
    const containersAvailableTableBody = document.querySelector('#containers-available-table tbody');
    containersInUseTableBody.innerHTML = '';
    containersAvailableTableBody.innerHTML = '';

    const noInUseMsg = document.getElementById('no-containers-in-use');
    const noAvailableMsg = document.getElementById('no-containers-available');
    noInUseMsg.classList.add('hidden');
    noAvailableMsg.classList.add('hidden');

    const inUseContainers = new Map(); // Map: containerNum -> latest active order details
    const availableContainers = new Map(); // Map: containerNum -> latest closed order details (for last available date)

    allOrders.forEach(order => {
        // Track containers currently "out" with customers (not closed or returned yet)
        if (order.סטטוס !== 'סגור' && order['מספר מכולה ירדה']) {
            inUseContainers.set(order['מספר מכולה ירדה'], order);
        }

        // Track containers that have been returned/uploaded (are now available)
        if (order.סטטוס === 'סגור' && order['מספר מכולה עלתה']) { // Container was uploaded/returned
            // If this container is not currently in use by another active order
            if (!inUseContainers.has(order['מספר מכולה עלתה'])) {
                 // Store the latest time this container became available
                if (!availableContainers.has(order['מספר מכולה עלתה']) || new Date(order['תאריך סגירה']) > new Date(availableContainers.get(order['מספר מכולה עלתה'])['תאריך סגירה'])) {
                    availableContainers.set(order['מספר מכולה עלתה'], order);
                }
            }
        }
    });

    // Populate "Containers in Use" table
    if (inUseContainers.size === 0) {
        noInUseMsg.classList.remove('hidden');
    } else {
        Array.from(inUseContainers.values()).sort((a,b) => String(a['מספר מכולה ירדה']).localeCompare(String(b['מספר מכולה ירדה']))).forEach(order => {
            const row = containersInUseTableBody.insertRow();
            row.insertCell().textContent = order['מספר מכולה ירדה'];
            row.insertCell().textContent = order['שם לקוח'];
            row.insertCell().textContent = formatDate(order['תאריך הזמנה']);
            row.insertCell().textContent = order['תעודה'];
            row.insertCell().textContent = order.סטטוס;
        });
    }

    // Populate "Available Containers" table
    if (availableContainers.size === 0) {
        noAvailableMsg.classList.remove('hidden');
    } else {
         Array.from(availableContainers.values()).sort((a,b) => String(a['מספר מכולה עלתה']).localeCompare(String(b['מספר מכולה עלתה']))).forEach(order => {
            const row = containersAvailableTableBody.insertRow();
            row.insertCell().textContent = order['מספר מכולה עלתה'];
            row.insertCell().textContent = formatDate(order['תאריך סגירה']);
            row.insertCell().innerHTML = `<span class="container-pill bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 cursor-pointer" onclick="event.stopPropagation(); showOrderDetails(allOrders.find(o => o.sheetRow === ${order.sheetRow}))">${order['תעודה']}</span>`;
        });
    }
}

/**
 * Renders the Kanban-style treatment board.
 * @param {Array<Object>} orders - All orders data.
 * מציג את לוח הטיפול בסגנון קאנבן.
 */
function renderTreatmentBoard(orders) {
    const overdueColumn = document.getElementById('column-overdue');
    const inProgressColumn = document.getElementById('column-in-progress');
    const resolvedColumn = document.getElementById('column-resolved');
    const noTreatmentOrdersMsg = document.getElementById('no-treatment-orders');

    overdueColumn.innerHTML = '<h3 class="text-xl font-bold text-red-600 dark:text-red-400">חורגות <i class="fas fa-exclamation-triangle mr-2"></i></h3>';
    inProgressColumn.innerHTML = '<h3 class="text-xl font-bold text-blue-600 dark:text-blue-400">בטיפול <i class="fas fa-spinner mr-2"></i></h3>';
    resolvedColumn.innerHTML = '<h3 class="text-xl font-bold text-green-600 dark:text-green-400">טופלו <i class="fas fa-check-circle mr-2"></i></h3>';

    const treatmentOrders = orders.filter(order =>
        order.סטטוס === 'חורג' ||
        order.סטטוס === 'ממתין/לא תקין' || // Treat pending/abnormal as "in progress"
        (order.סטטוס === 'פתוח' && order['תאריך סיום צפוי'] && (new Date(order['תאריך סיום צפוי']) < new Date())) // Open and overdue
    );

    if (treatmentOrders.length === 0) {
        noTreatmentOrdersMsg.classList.remove('hidden');
    } else {
        noTreatmentOrdersMsg.classList.add('hidden');
    }

    treatmentOrders.sort((a, b) => new Date(a['תאריך סיום צפוי']) - new Date(b['תאריך סיום צפוי'])).forEach(order => {
        const item = document.createElement('div');
        item.classList.add('kanban-item', 'bg-white', 'dark:bg-gray-800', 'p-4', 'rounded-xl', 'shadow-md', 'mb-3', 'cursor-grab', 'transition-all');
        item.setAttribute('draggable', true);
        item.dataset.sheetRow = order.sheetRow;
        item.dataset.orderId = order.תעודה;

        let statusColorClass = '';
        if (order.סטטוס === 'חורג' || (order.סטטוס === 'פתוח' && order['ימים שעברו'] && order['ימים שעברו'] > 0)) {
            statusColorClass = 'text-red-500';
            item.classList.add('border-red-400', 'border-r-4');
        } else if (order.סטטוס === 'ממתין/לא תקין') {
            statusColorClass = 'text-blue-500';
            item.classList.add('border-blue-400', 'border-r-4');
        } else if (order.סטטוס === 'טופל') { // If you add a "טופל" status via dropdown
             statusColorClass = 'text-green-500';
             item.classList.add('border-green-400', 'border-r-4');
        }

        const daysOverdueBadge = order.סטטוס === 'חורג' ? `<span class="overdue-days-badge bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">${order['ימים שעברו']} ימים חריגה</span>` : '';


        item.innerHTML = `
            <h4 class="font-bold text-lg mb-1 dark:text-gray-100">${order['שם לקוח']} - ${order['תעודה']}</h4>
            <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">${order.כתובת}</p>
            <p class="text-xs ${statusColorClass} font-semibold flex items-center gap-1 mb-2">
                <i class="fas fa-info-circle"></i> סטטוס: ${order.סטטוס} ${daysOverdueBadge}
            </p>
            <p class="text-sm text-gray-700 dark:text-gray-300">
                <strong>מכולה ירדה:</strong> ${order['מספר מכולה ירדה'] || '-'}
                ${order['מספר מכולה עלתה'] ? ` | <strong>מכולה עלתה:</strong> ${order['מספר מכולה עלתה']}` : ''}
            </p>
            <p class="text-sm text-gray-700 dark:text-gray-300 mb-2">
                <strong>צפוי סיום:</strong> ${formatDate(order['תאריך סיום צפוי'])}
            </p>
            <textarea class="form-textarea w-full text-xs mb-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-gray-200 resize-y" rows="2" placeholder="הערות טיפול..." onblur="updateKanbanNotes(${order.sheetRow}, this.value)">${order.הערות || ''}</textarea>
            <div class="flex justify-between items-center text-sm">
                <select onchange="updateKanbanStatusFromDropdown(this.value, ${order.sheetRow}, '${order.תעודה}')" class="form-select text-xs py-1 px-2 rounded-lg bg-white dark:bg-gray-700 dark:text-gray-200">
                    <option value="חורג" ${order.סטטוס === 'חורג' ? 'selected' : ''}>חורג</option>
                    <option value="ממתין/לא תקין" ${order.סטטוס === 'ממתין/לא תקין' ? 'selected' : ''}>ממתין/לא תקין</option>
                    <option value="טופל" ${order.סטטוס === 'טופל' ? 'selected' : ''}>טופל (לא סגור)</option>
                    <option value="סגור">סגור לחלוטין</option>
                </select>
                <div class="flex gap-1">
                    <button class="action-btn text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 p-1" onclick="event.stopPropagation(); showOrderDetails(${order.sheetRow})"><i class="fas fa-eye"></i></button>
                    <button class="action-btn text-xs text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200 p-1" onclick="event.stopPropagation(); openCloseOrderModal(${order.sheetRow}, '${order.תעודה}')"><i class="fas fa-check-circle"></i></button>
                </div>
            </div>
        `;

        item.addEventListener('dragstart', (e) => drag(e, order));

        if (order.סטטוס === 'חורג' || (order.סטטוס === 'פתוח' && order['ימים שעברו'] && order['ימים שעברו'] > 0)) {
            overdueColumn.appendChild(item);
        } else if (order.סטטוס === 'ממתין/לא תקין') {
            inProgressColumn.appendChild(item);
        } else { // Assuming 'טופל' is a new status for resolved but not closed
            resolvedColumn.appendChild(item);
        }
    });
}

/**
 * Allows dropping elements into a Kanban column.
 * @param {DragEvent} event
 * מאפשר גרירת אלמנטים לעמודת קאנבן.
 */
function allowDrop(event) {
    event.preventDefault(); // Allow drop
    event.target.closest('.kanban-column')?.classList.add('drag-over');
}

/**
 * Handles drag start event for Kanban items.
 * @param {DragEvent} event
 * @param {object} order - The order object being dragged.
 * מטפל באירוע התחלת גרירה עבור פריטי קאנבן.
 */
function drag(event, order) {
    event.dataTransfer.setData("text/plain", JSON.stringify(order));
    event.currentTarget.classList.add('dragging');
}

/**
 * Handles drop event for Kanban columns.
 * @param {DragEvent} event
 * מטפל באירוע שחרור עבור עמודות קאנבן.
 */
async function drop(event) {
    event.preventDefault();
    const targetColumn = event.target.closest('.kanban-column');
    if (targetColumn) {
        targetColumn.classList.remove('drag-over');
        const orderData = JSON.parse(event.dataTransfer.getData("text/plain"));
        const newStatus = mapColumnIdToStatus(targetColumn.id);

        if (newStatus && orderData.סטטוס !== newStatus) { // Only update if status changed
            let updateParams = {
                sheetRow: orderData.sheetRow,
                status: newStatus
            };
            if (newStatus === 'סגור') {
                // If dragged to 'סגור', open the close modal
                openCloseOrderModal(orderData.sheetRow, orderData.תעודה);
                // Prevent immediate status update here; it will happen in confirmCloseOrder
                return;
            }

            try {
                const response = await fetchData('updateOrderStatus', updateParams);
                if (response && response.status === 'success') {
                    showAlert(`הזמנה ${orderData.תעודה} עודכנה לסטטוס: ${newStatus}`, 'success');
                    loadOrders(); // Reload data to reflect changes
                } else {
                    showAlert('שגיאה בעדכון סטטוס: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
                }
            } catch (error) {
                // Error handled by fetchData
            }
        }
    }
    // Remove dragging class from the dragged item (if still exists)
    const draggedItem = document.querySelector('.kanban-item.dragging');
    if (draggedItem) {
        draggedItem.classList.remove('dragging');
    }
}

/**
 * Maps Kanban column ID to order status.
 * @param {string} columnId - The ID of the Kanban column.
 * @returns {string|null} The corresponding status string.
 * ממפה מזהה עמודת קאנבן לסטטוס הזמנה.
 */
function mapColumnIdToStatus(columnId) {
    switch (columnId) {
        case 'column-overdue':
            return 'חורג';
        case 'column-in-progress':
            return 'ממתין/לא תקין'; // Assuming "ממתין/לא תקין" means in progress
        case 'column-resolved':
            return 'טופל'; // New status for "resolved" but not necessarily "closed"
        default:
            return null;
    }
}

/**
 * Updates Kanban item's notes directly from textarea blur.
 * @param {number} sheetRow - The row number of the order.
 * @param {string} notes - The updated notes.
 * מעדכן הערות של פריט קאנבן ישירות מטקסטארה.
 */
async function updateKanbanNotes(sheetRow, notes) {
    const originalOrder = allOrders.find(order => order.sheetRow === sheetRow);
    if (!originalOrder || originalOrder.הערות === notes) return; // No change

    try {
        const response = await fetchData('updateOrderNotes', { sheetRow: sheetRow, notes: notes });
        if (response && response.status === 'success') {
            showAlert('הערות עודכנו בהצלחה!', 'success', 2000);
            // Update local allOrders array immediately to reflect change without full reload
            const index = allOrders.findIndex(order => order.sheetRow === sheetRow);
            if (index !== -1) {
                allOrders[index].הערות = notes;
            }
        } else {
            showAlert('שגיאה בעדכון הערות: ' + (response ? response.message : 'תגובה לא ידועה'), 'error', 3000);
        }
    } catch (error) {
        // Error handled by fetchData
    }
}

/**
 * Updates Kanban item's status from dropdown.
 * @param {string} newStatus - The new status from the dropdown.
 * @param {number} sheetRow - The row number of the order.
 * @param {string} orderId - The document ID of the order.
 * מעדכן סטטוס של פריט קאנבן מתוך רשימה נפתחת.
 */
async function updateKanbanStatusFromDropdown(newStatus, sheetRow, orderId) {
    if (newStatus === 'סגור') {
        openCloseOrderModal(sheetRow, orderId);
        return; // Handle closing via dedicated modal
    }

    try {
        const response = await fetchData('updateOrderStatus', { sheetRow: sheetRow, status: newStatus });
        if (response && response.status === 'success') {
            showAlert(`הזמנה ${orderId} עודכנה לסטטוס: ${newStatus}`, 'success');
            loadOrders(); // Reload to refresh all views
        } else {
            showAlert('שגיאה בעדכון סטטוס: ' + (response ? response.message : 'תגובה לא ידועה'), 'error');
        }
    } catch (error) {
        // Error handled by fetchData
    }
}


/**
 * Refreshes all data and re-renders UI.
 * מרענן את כל הנתונים ומציג מחדש את הממשק.
 */
function refreshData() {
    loadOrders();
    showAlert('הנתונים רועננו!', 'info');
}

/**
 * Shows the selected page and updates navigation buttons.
 * @param {string} pageId - The ID of the page to show.
 * מציג את העמוד הנבחר ומעדכן את כפתורי הניווט.
 */
function showPage(pageId) {
    // Hide all page contents
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.add('hidden');
    });

    // Show the selected page
    document.getElementById(pageId).classList.remove('hidden');

    // Update desktop navigation active state
    document.querySelectorAll('.nav-tab-btn').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
    });
    const desktopNavButton = document.getElementById(`nav-${pageId}`);
    if (desktopNavButton) {
        desktopNavButton.classList.add('active');
        desktopNavButton.setAttribute('aria-selected', 'true');
    }

    // Update mobile navigation active state
    document.querySelectorAll('.bottom-nav-btn').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-selected', 'false');
    });
    const mobileNavButton = document.getElementById(`bottom-nav-${pageId}`);
    if (mobileNavButton) {
        mobileNavButton.classList.add('active');
        mobileNavButton.setAttribute('aria-selected', 'true');
    }

    // Re-draw charts if switching back to dashboard to ensure responsiveness
    if (pageId === 'dashboard') {
        drawCharts(allOrders);
    }
}

/**
 * Updates the current date and time displayed in the header.
 * מעדכן את התאריך והשעה הנוכחיים המוצגים בכותרת העליונה.
 */
function updateDateTime() {
    const now = new Date();
    const dateOptions = { year: 'numeric', month: 'numeric', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

    document.getElementById('current-date').textContent = now.toLocaleDateString('he-IL', dateOptions);
    document.getElementById('current-time').textContent = now.toLocaleTimeString('he-IL', timeOptions);
}

/**
 * Opens the modal displaying customers with containers on their sites.
 * פותח את חלון המודאל המציג לקוחות עם מכולות באתרים שלהם.
 */
function openContainersOnSiteModal() {
    const modal = document.getElementById('containers-on-site-modal');
    const tableBody = document.querySelector('#containers-on-site-table tbody');
    tableBody.innerHTML = '';
    const noActiveContainersMsg = document.getElementById('no-active-containers-msg');
    noActiveContainersMsg.classList.add('hidden');

    const customerContainers = new Map(); // Key: customerName_address, Value: Set of container numbers

    allOrders.filter(order => order.סטטוס !== 'סגור' && order['מספר מכולה ירדה']).forEach(order => {
        const key = `${order['שם לקוח']}_${order['כתובת']}`;
        if (!customerContainers.has(key)) {
            customerContainers.set(key, { customer: order['שם לקוח'], address: order['כתובת'], containers: new Set() });
        }
        customerContainers.get(key).containers.add(order['מספר מכולה ירדה']);
    });

    if (customerContainers.size === 0) {
        noActiveContainersMsg.classList.remove('hidden');
    } else {
        Array.from(customerContainers.values()).sort((a, b) => a.customer.localeCompare(b.customer)).forEach(data => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = data.customer;
            row.insertCell().textContent = data.address;
            const containersCell = row.insertCell();
            containersCell.innerHTML = Array.from(data.containers).map(container =>
                `<span class="container-pill bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 cursor-pointer" onclick="event.stopPropagation(); openContainerHistoryModal('${container}')">${container}</span>`
            ).join(' ');
        });
    }

    if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the containers on site modal.
 * סוגר את חלון המודאל של מכולות באתרים.
 */
function closeContainersOnSiteModal() {
    document.getElementById('containers-on-site-modal').classList.remove('active');
}

/**
 * Opens the "Export Actions" modal.
 * פותח את חלון המודאל "פעולות ייצוא".
 */
function openExportActionsModal() {
    const modal = document.getElementById('export-actions-modal');
     if (isMobile()) {
        modal.classList.add('mobile-drawer');
    } else {
        modal.classList.remove('mobile-drawer');
    }
    modal.classList.add('active');
}

/**
 * Closes the "Export Actions" modal.
 * סוגר את חלון המודאל "פעולות ייצוא".
 */
function closeExportActionsModal() {
    document.getElementById('export-actions-modal').classList.remove('active');
}

// Keyboard Shortcuts - קיצורי מקלדת
document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'n') {
        event.preventDefault();
        openOrderModal('add');
    }
    if (event.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        if (activeModals.length > 0) {
            // Click the close button of the topmost active modal
            activeModals[activeModals.length - 1].querySelector('.modal-close-btn')?.click();
        }
    }
});

// Initial Load and Event Listeners - טעינה ראשונית ומאזיני אירועים
window.onload = () => {
    initializeTheme(); // Initialize theme first - אתחל ערכת נושא ראשית
    loadOrders(); // Load all orders - טען את כל ההזמנות
    showPage('dashboard'); // Show dashboard page - הצג את עמוד הדאשבורד
    updateDateTime(); // Update current date and time - עדכן תאריך ושעה נוכחיים
    setInterval(updateDateTime, 1000); // Update date and time every second - עדכן תאריך ושעה כל שנייה

    // Event listener for theme toggle button
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    // Event listener for notification bell (placeholder for future functionality)
    document.getElementById('notification-bell').addEventListener('click', () => {
        showAlert('כאן יוצגו התראות חדשות!', 'info');
        // In a real app, you'd open a notification dropdown/modal here
    });

    // Handle resize to redraw charts
    window.addEventListener('resize', () => {
        // Only redraw if a chart is not in fullscreen mode, or if we are on dashboard page
        if (!document.querySelector('.chart-fullscreen')) {
             if (!document.getElementById('dashboard-page').classList.contains('hidden')) {
                drawCharts(allOrders);
            }
        }
    });

    // Drag and drop event listeners for Kanban board (on the columns themselves)
    document.getElementById('column-overdue').addEventListener('dragleave', (e) => e.target.closest('.kanban-column')?.classList.remove('drag-over'));
    document.getElementById('column-in-progress').addEventListener('dragleave', (e) => e.target.closest('.kanban-column')?.classList.remove('drag-over'));
    document.getElementById('column-resolved').addEventListener('dragleave', (e) => e.target.closest('.kanban-column')?.classList.remove('drag-over'));
    document.getElementById('column-overdue').addEventListener('dragenter', (e) => e.target.closest('.kanban-column')?.classList.add('drag-over'));
    document.getElementById('column-in-progress').addEventListener('dragenter', (e) => e.target.closest('.kanban-column')?.classList.add('drag-over'));
    document.getElementById('column-resolved').addEventListener('dragenter', (e) => e.target.closest('.kanban-column')?.classList.add('drag-over'));
};

