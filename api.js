// NEW FILE: api.js (or integrated into your main JS file as shown below)
const SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_DEPLOYMENT_URL_HERE'; // Replace with your actual deployment URL

/**
 * @typedef {Object} OrderData
 * @property {string} id
 * @property {string} customerId
 * @property {string} customerName
 * @property {string} documentId
 * @property {string} address
 * @property {string} actionType
 * @property {string} containerNumber
 * @property {string} status
 * @property {string} notes
 * @property {number} daysInUse
 * @property {string} dropDate
 * @property {string} pickupDate
 * @property {string} expectedEndDate
 */

/**
 * @typedef {Object} ContainerPair
 * @property {Object} drop
 * @property {string} drop.date
 * @property {string} drop.documentId
 * @property {string} drop.containerNumber
 * @property {Object} pickup
 * @property {string} pickup.date
 * @property {string} pickup.documentId
 * @property {string} pickup.containerNumber
 * @property {number} daysInUse
 * @property {boolean} isAnomalous
 * @property {string} anomalyReason
 */

/**
 * Fetches all orders from the Google Sheet.
 * @returns {Promise<OrderData[]>}
 */
async function fetchOrders() {
    return new Promise((resolve, reject) => {
        // This is the original call, keeping it as is for backward compatibility
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .getOrders();
    });
}

/**
 * Fetches the history and container pairs for a specific customer.
 * @param {string} customerId - The unique ID of the customer.
 * @returns {Promise<{history: OrderData[], pairs: ContainerPair[]}>}
 */
async function getCustomerData(customerId) {
    return new Promise((resolve, reject) => {
        // NEW API call
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .getCustomerData(customerId);
    });
}

/**
 * Fetches all active alerts based on the defined rules.
 * @returns {Promise<Object[]>}
 */
async function getAlerts() {
    return new Promise((resolve, reject) => {
        // NEW API call
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .getAlerts();
    });
}

/**
 * Marks an alert as handled and adds a note to the log.
 * @param {string} alertId - The ID of the alert to handle.
 * @param {string} note - The note to add to the log.
 * @returns {Promise<boolean>}
 */
async function setAlertHandled(alertId, note) {
    return new Promise((resolve, reject) => {
        // NEW API call
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .setAlertHandled(alertId, note);
    });
}

/**
 * Fetches the geo coordinates for a given address.
 * @param {string} address
 * @returns {Promise<{lat: number, lon: number}>}
 */
async function getMapGeo(address) {
    return new Promise((resolve, reject) => {
        // NEW API call
        google.script.run
            .withSuccessHandler(resolve)
            .withFailureHandler(reject)
            .getMapGeo(address);
    });
}

/**
 * Sends a message via the external API (WhatsApp/SMS/Email).
 * @param {string} type - 'whatsapp', 'sms', or 'email'
 * @param {Object} data - The data for the message.
 * @returns {Promise<boolean>}
 */
async function sendMessage(type, data) {
    return new Promise((resolve, reject) => {
        // Placeholder for a future API call to an external messaging service
        // In a real scenario, this would call a Google Apps Script function that triggers a third-party service
        console.log(`Sending message via ${type}:`, data);
        resolve(true); // Simulate success
    });
}

// NEW FILE: app.js
let allOrders = [];
let originalOrders = [];
let currentSortColumn = 'documentId';
let currentSortDirection = 'asc';
let activeView = 'dashboard';
let currentCustomerData = null;

// NEW: Configuration object for alerts
const ALERTS_CONFIG = {
    softWarning: 10,
    warning: 14,
    critical: 21,
    templates: {
        whatsapp: [
            "היי {שם_לקוח}, תזכורת קטנה לגבי המכולה מספר {מס׳_מכולה} שנמצאת בכתובת {כתובת}. עברו כבר {ימים_בשימוש} ימים, אנא עדכן אותנו במועד הפינוי הצפוי. תודה!",
            "שלום {שם_לקוח}, תקופת השכירות למכולה {מס׳_מכולה} מסתיימת בקרוב. אנא תאם פינוי עד לתאריך {תאריך_סיום_משוער} כדי להימנע מחיובים נוספים."
        ],
        sms: [
            "תזכורת: מכולה {מס׳_מכולה} בכתובת {כתובת} נמצאת אצלך {ימים_בשימוש} ימים. אנא עדכן תאריך פינוי.",
            "היי {שם_לקוח}, תקופת השכירות למכולה {מס׳_מכולה} מסתיימת. אנא תאם פינוי."
        ],
        email: [
            "נושא: תזכורת - סטטוס הזמנה למכולה {מס׳_מכולה}",
            "גוף: שלום {שם_לקוח}, \n\nבהתייחס להזמנה מספר {תעודה} למכולה {מס׳_מכולה} בכתובת {כתובת}, נציין כי המכולה נמצאת אצלך כבר {ימים_בשימוש} ימים. \n\nעל מנת להימנע מחיובים נוספים, אנו מבקשים ממך לתאם את מועד פינוי המכולה בהקדם. \n\nתודה רבה,\nצוות מכולות {שם_החברה}"
        ]
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Original event listeners
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('searchInput').addEventListener('input', debounce(filterAndDisplayOrders, 300));
    document.getElementById('statusFilter').addEventListener('change', filterAndDisplayOrders);
    document.getElementById('addOrderBtn').addEventListener('click', () => showModal('orderModal'));
    document.getElementById('orderModal').addEventListener('click', (e) => {
        if (e.target.id === 'orderModal') closeModal('orderModal');
    });

    // NEW event listeners for navigation
    document.getElementById('nav-dashboard').addEventListener('click', () => navigate('dashboard'));
    document.getElementById('nav-inventory').addEventListener('click', () => navigate('inventory'));
    document.getElementById('nav-treatment').addEventListener('click', () => navigate('treatment'));
    document.getElementById('nav-alerts').addEventListener('click', () => navigate('alerts'));
    document.getElementById('backToDashboardBtn').addEventListener('click', () => navigate('dashboard'));
    
    // NEW event listener for Customer Profile view modal link
    document.getElementById('orderModal').addEventListener('click', (e) => {
        if (e.target.id === 'modalCustomerName') {
            const customerId = e.target.dataset.customerId;
            if (customerId) {
                closeModal('orderModal');
                loadCustomerProfile(customerId);
            }
        }
    });

    // NEW event listeners for alerts modal
    document.getElementById('alertModalMarkDoneBtn').addEventListener('click', handleAlert);
    
    // Initial data load
    loadData();
    window.onscroll = function() {
        const scrollToTopBtn = document.getElementById('scroll-to-top-btn');
        if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) {
            scrollToTopBtn.style.transform = 'scale(1)';
            scrollToTopBtn.style.opacity = '1';
        } else {
            scrollToTopBtn.style.transform = 'scale(0)';
            scrollToTopBtn.style.opacity = '0';
        }
    };
});

// --- UI & Navigation Functions ---
/**
 * Navigates between different views of the application.
 * @param {string} viewName - The ID of the view to show ('dashboard', 'customer', 'alerts', etc.).
 */
function navigate(viewName) {
    document.querySelectorAll('.page-view').forEach(view => view.classList.add('hidden'));
    document.getElementById(`view-${viewName}`).classList.remove('hidden');
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${viewName}`).classList.add('active');
    activeView = viewName;
    if (viewName === 'alerts') {
        loadAlerts();
    }
}

// --- Data Loading & Display Functions ---
/**
 * Loads and displays initial data.
 */
async function loadData() {
    showLoader();
    try {
        const data = await fetchOrders();
        allOrders = data;
        originalOrders = [...data];
        console.log("All orders loaded:", allOrders);
        updateKPIs(allOrders);
        filterAndDisplayOrders();
        // You can also load other initial data here if needed
    } catch (e) {
        console.error("Failed to load data:", e);
        showAlert('שגיאה בטעינת הנתונים.', 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Updates KPI cards with calculated values.
 * @param {OrderData[]} orders
 */
function updateKPIs(orders) {
    const totalOrders = orders.length;
    const activeOrders = orders.filter(o => o.status === 'open').length;
    const overdueOrders = orders.filter(o => o.status === 'overdue').length;
    const pendingPickup = orders.filter(o => o.actionType.includes('העלאה') && o.status !== 'closed').length;

    document.getElementById('kpi-total-orders').querySelector('div').textContent = totalOrders;
    document.getElementById('kpi-active-orders').querySelector('div').textContent = activeOrders;
    document.getElementById('kpi-overdue-orders').querySelector('div').textContent = overdueOrders;
    document.getElementById('kpi-pending-pickup').querySelector('div').textContent = pendingPickup;
}

/**
 * Renders the orders table based on current filters and sorting.
 */
function renderTable() {
    const tableBody = document.getElementById('ordersTableBody');
    tableBody.innerHTML = '';
    
    // Sort data
    const sortedOrders = [...allOrders].sort((a, b) => {
        const aVal = a[currentSortColumn];
        const bVal = b[currentSortColumn];

        if (aVal === bVal) return 0;
        if (currentSortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    sortedOrders.forEach(order => {
        const row = document.createElement('tr');
        row.className = `border-b dark:border-gray-700 cursor-pointer ${order.status === 'overdue' ? 'overdue-blinking' : ''}`;
        row.dataset.orderId = order.id;
        row.onclick = () => showOrderModal(order);
        row.innerHTML = `
            <td class="py-4 px-6 font-medium text-gray-900 whitespace-nowrap dark:text-white">${order.customerName}</td>
            <td class="py-4 px-6">${order.documentId}</td>
            <td class="py-4 px-6">${order.containerNumber}</td>
            <td class="py-4 px-6">${order.address}</td>
            <td class="py-4 px-6">${order.actionType}</td>
            <td class="py-4 px-6">
                <span class="status-${order.status} ${order.status === 'overdue' ? 'overdue-text-blinking' : ''}">${order.status === 'open' ? 'פעיל' : (order.status === 'closed' ? 'סגור' : 'חריג')}</span>
            </td>
            <td class="py-4 px-6">${order.daysInUse}</td>
            <td class="py-4 px-6 text-right">
                <button class="action-icon-btn text-primary-light" onclick="event.stopPropagation(); showOrderModal(order);"><i class="fas fa-eye"></i></button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

/**
 * Filter and sort the data based on current UI state.
 */
function filterAndDisplayOrders() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;

    allOrders = originalOrders.filter(order => {
        const matchesSearch = searchTerm === '' ||
            order.customerName.toLowerCase().includes(searchTerm) ||
            order.documentId.toLowerCase().includes(searchTerm) ||
            order.address.toLowerCase().includes(searchTerm);
        
        const matchesStatus = status === 'all' || order.status === status;
        
        return matchesSearch && matchesStatus;
    });

    renderTable();
}

/**
 * Sorts the table by a given column.
 * @param {string} column - The column to sort by.
 */
function sortTable(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    renderTable();
}

// --- Modal Functions ---
/**
 * Displays a specific modal.
 * @param {string} modalId - The ID of the modal to show.
 */
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

/**
 * Closes a specific modal.
 * @param {string} modalId - The ID of the modal to close.
 */
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

/**
 * Populates and shows the order details modal.
 * @param {OrderData} order - The order data object.
 */
async function showOrderModal(order) {
    document.getElementById('modalDocumentId').textContent = order.documentId;
    
    const customerNameElement = document.getElementById('modalCustomerName');
    customerNameElement.textContent = order.customerName;
    customerNameElement.dataset.customerId = order.customerId;
    
    document.getElementById('modalAddress').textContent = order.address;
    document.getElementById('modalContainerNumbers').textContent = order.containerNumber;
    document.getElementById('modalStatus').textContent = order.status;
    document.getElementById('modalDropDate').textContent = order.dropDate || '-';
    document.getElementById('modalPickupDate').textContent = order.pickupDate || '-';
    document.getElementById('modalNotes').textContent = order.notes || '-';
    
    showLoader();
    try {
        const geoData = await getMapGeo(order.address);
        if (geoData) {
            initMap(geoData.lat, geoData.lon);
        } else {
            document.getElementById('leafletMap').innerHTML = '<div class="flex items-center justify-center w-full h-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">מפה זמינה רק אם קיימות קואורדינטות</div>';
        }
    } catch (e) {
        console.error("Failed to get geo data:", e);
        document.getElementById('leafletMap').innerHTML = '<div class="flex items-center justify-center w-full h-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">שגיאה בטעינת המפה</div>';
    } finally {
        hideLoader();
    }

    showModal('orderModal');
}

let mapInstance = null;
/**
 * Initializes and displays a Leaflet map.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 */
function initMap(lat, lon) {
    if (mapInstance) {
        mapInstance.remove();
    }
    const map = L.map('leafletMap').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    L.marker([lat, lon]).addTo(map)
        .bindPopup('מיקום ההזמנה')
        .openPopup();
    mapInstance = map;
}

// --- NEW Customer Profile Logic ---
/**
 * Loads and renders the customer profile page.
 * @param {string} customerId - The ID of the customer.
 */
async function loadCustomerProfile(customerId) {
    showLoader();
    navigate('customer');
    try {
        const customerData = await getCustomerData(customerId);
        currentCustomerData = customerData;
        console.log("Customer data loaded:", customerData);

        const customerName = (customerData.history.find(o => o.customerId === customerId) || {}).customerName || 'לא ידוע';
        document.getElementById('customer-name-heading').textContent = customerName;

        const containerPairs = customerData.pairs;
        renderHistoryTables(containerPairs);
        renderTimeline(containerPairs);

    } catch (e) {
        console.error("Failed to load customer profile:", e);
        showAlert('שגיאה בטעינת פרופיל הלקוח.', 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Renders the drop and pickup history tables.
 * @param {ContainerPair[]} pairs
 */
function renderHistoryTables(pairs) {
    const dropTable = document.getElementById('drop-history-table');
    const pickupTable = document.getElementById('pickup-history-table');
    dropTable.innerHTML = '';
    pickupTable.innerHTML = '';

    pairs.forEach(pair => {
        // Drop row
        const dropRow = document.createElement('tr');
        dropRow.className = `cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 animated-fade-in ${pair.isAnomalous ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`;
        dropRow.innerHTML = `
            <td class="py-2 px-4">${formatDate(pair.drop.date)}</td>
            <td class="py-2 px-4">${pair.drop.documentId}</td>
            <td class="py-2 px-4">${pair.drop.containerNumber} ${pair.isAnomalous ? `<span class="has-tooltip relative text-yellow-600 dark:text-yellow-400 ml-2">💡<span class="tooltip-custom">${pair.anomalyReason}</span></span>` : ''}</td>
        `;
        dropTable.appendChild(dropRow);

        // Pickup row
        if (pair.pickup) {
            const pickupRow = document.createElement('tr');
            pickupRow.className = `cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 animated-fade-in ${pair.isAnomalous ? 'bg-yellow-100 dark:bg-yellow-900' : ''}`;
            pickupRow.innerHTML = `
                <td class="py-2 px-4">${formatDate(pair.pickup.date)}</td>
                <td class="py-2 px-4">${pair.pickup.documentId}</td>
                <td class="py-2 px-4">${pair.pickup.containerNumber}</td>
            `;
            pickupTable.appendChild(pickupRow);
        }
    });
}

/**
 * Renders the animated timeline.
 * @param {ContainerPair[]} pairs
 */
function renderTimeline(pairs) {
    const timelineContainer = document.querySelector('.timeline');
    timelineContainer.innerHTML = '<div class="timeline-line"></div>';

    const events = pairs.flatMap(pair => {
        const dropEvent = {
            date: pair.drop.date,
            documentId: pair.drop.documentId,
            type: 'drop',
            isAnomalous: pair.isAnomalous,
            anomalyReason: pair.anomalyReason
        };
        if (pair.pickup) {
            const pickupEvent = {
                date: pair.pickup.date,
                documentId: pair.pickup.documentId,
                type: 'pickup',
                isAnomalous: pair.isAnomalous,
                anomalyReason: pair.anomalyReason
            };
            return [dropEvent, pickupEvent];
        }
        return [dropEvent];
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    events.forEach((event, index) => {
        const eventEl = document.createElement('div');
        eventEl.className = `timeline-event flex items-center mb-6 w-full ${index % 2 === 0 ? 'flex-row-reverse event-right' : 'flex-row event-left'}`;
        
        eventEl.innerHTML = `
            <div class="card p-4 rounded-xl shadow-md w-full relative z-10 animated-fade-in">
                <p class="font-bold text-lg">${formatDate(event.date)}</p>
                <p class="text-sm">תעודה: ${event.documentId}</p>
                <p class="text-xs text-muted">
                    ${event.isAnomalous ? `<span class="has-tooltip relative text-yellow-600 dark:text-yellow-400">💡<span class="tooltip-custom">${event.anomalyReason}</span></span>` : ''}
                </p>
            </div>
            <div class="timeline-icon"><i class="fas fa-thumbtack"></i></div>
        `;
        timelineContainer.appendChild(eventEl);
    });

    const timelineArrow = document.createElement('div');
    timelineArrow.className = 'timeline-pointer animated-arrow-icon';
    timelineArrow.innerHTML = '➜';
    timelineContainer.appendChild(timelineArrow);
}

// --- NEW Alerts Logic ---
/**
 * Loads and displays all active alerts.
 */
async function loadAlerts() {
    showLoader();
    try {
        const alerts = await getAlerts();
        renderAlerts(alerts);
        updateAlertsSummary(alerts);
    } catch (e) {
        console.error("Failed to load alerts:", e);
        showAlert('שגיאה בטעינת ההתראות.', 'error');
    } finally {
        hideLoader();
    }
}

/**
 * Renders the alert cards.
 * @param {Object[]} alerts
 */
function renderAlerts(alerts) {
    const alertsContainer = document.getElementById('alerts-container');
    alertsContainer.innerHTML = '';
    
    // Group alerts by severity
    const groupedAlerts = { critical: [], warning: [], soft: [] };
    alerts.forEach(alert => {
        const daysInUse = Math.ceil((new Date() - new Date(alert.dropDate)) / (1000 * 60 * 60 * 24));
        if (daysInUse >= ALERTS_CONFIG.critical) {
            groupedAlerts.critical.push(alert);
        } else if (daysInUse >= ALERTS_CONFIG.warning) {
            groupedAlerts.warning.push(alert);
        } else {
            groupedAlerts.soft.push(alert);
        }
    });

    Object.keys(groupedAlerts).forEach(severity => {
        if (groupedAlerts[severity].length > 0) {
            const heading = document.createElement('div');
            heading.className = 'col-span-full mt-4';
            heading.innerHTML = `<h3 class="text-2xl font-bold mb-2 ${severity === 'critical' ? 'text-danger' : (severity === 'warning' ? 'text-warning' : 'text-info')}">${severity === 'critical' ? 'קריטי' : (severity === 'warning' ? 'התראה' : 'אזהרה רכה')}</h3>`;
            alertsContainer.appendChild(heading);

            groupedAlerts[severity].forEach(alert => {
                const card = document.createElement('div');
                card.className = `alert-card card p-4 flex flex-col gap-2 cursor-pointer ${severity}`;
                card.dataset.alertId = alert.id;
                card.dataset.documentId = alert.documentId;
                card.onclick = () => showAlertModal(alert);

                const daysInUse = Math.ceil((new Date() - new Date(alert.dropDate)) / (1000 * 60 * 60 * 24));
                const message = ALERTS_CONFIG.templates.whatsapp[0]
                    .replace('{שם_לקוח}', alert.customerName)
                    .replace('{כתובת}', alert.address)
                    .replace('{מס׳_מכולה}', alert.containerNumber)
                    .replace('{ימים_בשימוש}', daysInUse)
                    .replace('{תאריך_סיום_משוער}', alert.expectedEndDate);

                card.innerHTML = `
                    <div class="flex items-center gap-2">
                        <i class="fas fa-exclamation-triangle ${severity === 'critical' ? 'text-danger' : (severity === 'warning' ? 'text-warning' : 'text-info')}"></i>
                        <span class="font-semibold">${alert.customerName} - מכולה ${alert.containerNumber}</span>
                    </div>
                    <p class="text-sm text-gray-600 dark:text-gray-400">נמצאת בשטח ${daysInUse} ימים</p>
                    <p class="text-sm font-light text-muted">${message}</p>
                `;
                alertsContainer.appendChild(card);
            });
        }
    });
}

/**
 * Updates the alerts summary counts.
 * @param {Object[]} alerts
 */
function updateAlertsSummary(alerts) {
    const totalCustomers = new Set(alerts.map(a => a.customerName)).size;
    const totalDrops = alerts.filter(a => a.actionType.includes('הורדה') || a.actionType.includes('הצבה')).length;
    const totalOverdue = alerts.filter(a => a.daysInUse >= ALERTS_CONFIG.critical).length;
    document.getElementById('alerts-summary').textContent = `(סה"כ לקוחות: ${totalCustomers}, הזמנות פעילות: ${totalDrops}, חריגות: ${totalOverdue})`;
}

/**
 * Populates and shows the alert handling modal.
 * @param {Object} alert - The alert data object.
 */
function showAlertModal(alert) {
    const modalContent = document.getElementById('alertModalContent');
    const daysInUse = Math.ceil((new Date() - new Date(alert.dropDate)) / (1000 * 60 * 60 * 24));
    
    // Select a template based on severity
    const template = ALERTS_CONFIG.templates.whatsapp[0]; // Example: always use first WhatsApp template
    const message = template
        .replace('{שם_לקוח}', alert.customerName)
        .replace('{כתובת}', alert.address)
        .replace('{מס׳_מכולה}', alert.containerNumber)
        .replace('{ימים_בשימוש}', daysInUse);
        
    modalContent.innerHTML = `
        <div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <p class="font-bold text-lg">${alert.customerName}</p>
            <p class="text-sm">מכולה: ${alert.containerNumber}</p>
            <p class="text-sm">ימים בשטח: ${daysInUse}</p>
            <p class="mt-2 text-sm text-muted">תבנית הודעה מומלצת:</p>
            <p class="font-mono text-sm border-r-4 border-primary-light pr-2 mt-1 whitespace-pre-wrap">${message}</p>
        </div>
        <input type="hidden" id="modalAlertId" value="${alert.id}">
        <input type="hidden" id="modalDocumentIdRedirect" value="${alert.documentId}">
    `;
    
    document.getElementById('alertModalSendBtn').onclick = () => {
        // Here you would call the sendMessage API with the selected template and data
        sendMessage('whatsapp', { customerId: alert.customerId, message: message });
    };

    document.getElementById('alertModalMarkDoneBtn').onclick = () => {
        handleAlert(alert.id);
    };

    showModal('alertModal');
}

/**
 * Handles an alert by marking it as done and redirecting to the order.
 * @param {string} alertId - The ID of the alert.
 */
async function handleAlert(alertId) {
    const note = document.getElementById('alertNoteInput').value;
    const documentId = document.getElementById('modalDocumentIdRedirect').value;
    showLoader();
    try {
        await setAlertHandled(alertId, note);
        closeModal('alertModal');
        showAlert('ההתראה סומנה כטופלה.', 'success');
        
        // Redirect to the order details in the main table
        const order = allOrders.find(o => o.documentId === documentId);
        if (order) {
            showOrderModal(order);
        } else {
            console.warn(`Order with document ID ${documentId} not found.`);
        }
        
    } catch (e) {
        console.error("Failed to handle alert:", e);
        showAlert('שגיאה בסימון ההתראה כטופלה.', 'error');
    } finally {
        hideLoader();
    }
}

// --- Utility Functions ---
/**
 * Debounce a function to prevent it from being called too frequently.
 * @param {Function} func
 * @param {number} delay
 * @returns {Function}
 */
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Displays a loading overlay.
 */
function showLoader() {
    document.getElementById('loader-overlay').classList.remove('hidden');
}

/**
 * Hides the loading overlay.
 */
function hideLoader() {
    document.getElementById('loader-overlay').classList.add('hidden');
}

/**
 * Formats a date string to a more readable format.
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/**
 * Displays a custom alert message.
 * @param {string} message - The message to display.
 * @param {string} type - 'success', 'error', 'info'.
 */
function showAlert(message, type) {
    console.log(`Alert (${type}): ${message}`);
    // In a real app, this would show a custom, non-blocking UI notification.
    // For this example, we'll just log it.
}

// Keep the original theme toggle function
function toggleTheme() {
    document.body.classList.toggle('dark');
}

// NEW FILE: Code.gs (Google Apps Script)
/**
 * This script serves as the backend for the CRM application, interacting with a Google Sheet.
 * This is a partial script, showing only the NEW functions requested.
 * It assumes an existing `CRM` sheet with the specified columns.
 */

// Global constant for sheet names
const SHEET_NAMES = {
    CRM: "CRM",
    ALERTS_LOG: "Alerts_Log",
    CONFIG: "Config"
};

/**
 * Fetches all orders from the CRM sheet. (Keeping this for compatibility)
 * @returns {Object[]} An array of order objects.
 */
function getOrders() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CRM);
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    // Normalize headers for easier object mapping
    const headerMap = {};
    headers.forEach((h, i) => headerMap[h.trim()] = i);
    
    const orders = data.map((row, index) => {
        const dropDate = row[headerMap['תאריך']].toString();
        const dropDateObj = new Date(dropDate);
        const today = new Date();
        const daysInUse = Math.floor((today - dropDateObj) / (1000 * 60 * 60 * 24));
        
        const status = row[headerMap['סטטוס']];
        let calculatedStatus = status;
        if (status === 'פעיל' && daysInUse > 21) {
            calculatedStatus = 'overdue';
        }

        return {
            id: 'order-' + index, // Unique ID for client-side use
            customerId: row[headerMap['לקוח']] + '_' + row[headerMap['טלפון לקוח']], // Example simple unique ID
            customerName: row[headerMap['לקוח']],
            documentId: row[headerMap['תעודה']],
            address: row[headerMap['כתובת']],
            actionType: row[headerMap['סוג פעולה']],
            containerNumber: row[headerMap['מס\' מכולה']],
            status: calculatedStatus,
            notes: row[headerMap['הערות']],
            daysInUse: daysInUse,
            dropDate: dropDate,
            pickupDate: row[headerMap['תאריך סגירה']],
            expectedEndDate: row[headerMap['תאריך סיום צפוי']]
        };
    });
    return orders;
}

/**
 * NEW: Fetches the history and smart-matched container pairs for a given customer.
 * @param {string} customerId - The ID of the customer.
 * @returns {{history: Object[], pairs: Object[]}}
 */
function getCustomerData(customerId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CRM);
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    
    const headerMap = {};
    headers.forEach((h, i) => headerMap[h.trim()] = i);
    
    // Filter data for the specific customer
    const customerHistory = data.filter(row => {
        const rowCustomerId = row[headerMap['לקוח']] + '_' + row[headerMap['טלפון לקוח']];
        return rowCustomerId === customerId;
    }).map((row, index) => {
        const dropDate = row[headerMap['תאריך']].toString();
        const dropDateObj = new Date(dropDate);
        const today = new Date();
        const daysInUse = Math.floor((today - dropDateObj) / (1000 * 60 * 60 * 24));
        
        const status = row[headerMap['סטטוס']];
        let calculatedStatus = status;
        if (status === 'פעיל' && daysInUse > 21) {
            calculatedStatus = 'overdue';
        }
        
        return {
            id: 'order-' + index,
            customerId: row[headerMap['לקוח']] + '_' + row[headerMap['טלפון לקוח']],
            customerName: row[headerMap['לקוח']],
            documentId: row[headerMap['תעודה']],
            address: row[headerMap['כתובת']],
            actionType: row[headerMap['סוג פעולה']],
            containerNumber: row[headerMap['מס\' מכולה ירדה']] || row[headerMap['מס\' מכולה עלתה']],
            status: calculatedStatus,
            notes: row[headerMap['הערות']],
            daysInUse: daysInUse,
            dropDate: dropDate,
            pickupDate: row[headerMap['תאריך סגירה']],
            expectedEndDate: row[headerMap['תאריך סיום צפוי']]
        };
    });
    
    // Logic for smart matching container pairs
    const drops = customerHistory.filter(o => o.actionType.includes('הורדה') || o.actionType.includes('הצבה'));
    const pickups = customerHistory.filter(o => o.actionType.includes('העלאה') || o.actionType.includes('הוצאה'));
    
    const pairs = [];
    const matchedPickups = new Set();
    
    drops.forEach(drop => {
        let matchedPickup = null;
        let anomalyReason = '';
        
        // Find the most likely matching pickup
        const potentialPickups = pickups.filter(p => 
            p.containerNumber === drop.containerNumber &&
            !matchedPickups.has(p.documentId) &&
            new Date(p.dropDate) >= new Date(drop.dropDate)
        ).sort((a, b) => new Date(a.dropDate) - new Date(b.dropDate));
        
        if (potentialPickups.length > 0) {
            matchedPickup = potentialPickups[0];
            matchedPickups.add(matchedPickup.documentId);
        } else {
            anomalyReason = 'מכולה ירדה אך לא נמצאה העלאה תואמת.';
        }
        
        const daysInUse = matchedPickup ? Math.floor((new Date(matchedPickup.dropDate) - new Date(drop.dropDate)) / (1000 * 60 * 60 * 24)) : drop.daysInUse;
        
        pairs.push({
            drop: {
                date: drop.dropDate,
                documentId: drop.documentId,
                containerNumber: drop.containerNumber
            },
            pickup: matchedPickup ? {
                date: matchedPickup.dropDate,
                documentId: matchedPickup.documentId,
                containerNumber: matchedPickup.containerNumber
            } : null,
            daysInUse: daysInUse,
            isAnomalous: !!anomalyReason,
            anomalyReason: anomalyReason
        });
    });
    
    // Identify pickups without a matching drop
    pickups.forEach(pickup => {
        if (!matchedPickups.has(pickup.documentId)) {
            pairs.push({
                drop: null,
                pickup: {
                    date: pickup.dropDate,
                    documentId: pickup.documentId,
                    containerNumber: pickup.containerNumber
                },
                isAnomalous: true,
                anomalyReason: 'מכולה עלתה אך לא נמצאה ירידה תואמת.'
            });
        }
    });
    
    return {
        history: customerHistory,
        pairs: pairs.sort((a, b) => new Date(a.drop?.date || a.pickup?.date) - new Date(b.drop?.date || b.pickup?.date))
    };
}


/**
 * NEW: Fetches active alerts for all customers based on time thresholds.
 * @returns {Object[]}
 */
function getAlerts() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CRM);
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const headerMap = {};
    headers.forEach((h, i) => headerMap[h.trim()] = i);
    
    const alerts = [];
    const today = new Date();
    
    data.forEach((row, index) => {
        const status = row[headerMap['סטטוס']];
        const actionType = row[headerMap['סוג פעולה']];
        
        if (status === 'פעיל' && (actionType.includes('הורדה') || actionType.includes('הצבה'))) {
            const dropDate = new Date(row[headerMap['תאריך']]);
            const expectedEndDate = new Date(row[headerMap['תאריך סיום צפוי']]);
            const daysInUse = Math.floor((today - dropDate) / (1000 * 60 * 60 * 24));
            
            // This is a simplified check. In a real-world scenario, you'd check against your Config sheet.
            if (daysInUse > 10 || (expectedEndDate && today > expectedEndDate)) {
                alerts.push({
                    id: `alert-${index}`,
                    customerId: row[headerMap['לקוח']] + '_' + row[headerMap['טלפון לקוח']],
                    customerName: row[headerMap['לקוח']],
                    documentId: row[headerMap['תעודה']],
                    address: row[headerMap['כתובת']],
                    containerNumber: row[headerMap['מס\' מכולה ירדה']],
                    dropDate: row[headerMap['תאריך']],
                    daysInUse: daysInUse,
                    expectedEndDate: row[headerMap['תאריך סיום צפוי']]
                });
            }
        }
    });
    return alerts;
}

/**
 * NEW: Marks an alert as handled and logs it.
 * @param {string} alertId - The ID of the alert to handle.
 * @param {string} note - The note to add to the log.
 * @returns {boolean}
 */
function setAlertHandled(alertId, note) {
    const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ALERTS_LOG);
    if (!logSheet) {
        // Create the log sheet if it doesn't exist
        SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAMES.ALERTS_LOG);
        const newLogSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ALERTS_LOG);
        newLogSheet.getRange('A1:D1').setValues([['Alert ID', 'Action', 'Note', 'Timestamp', 'User']]);
    }

    const userEmail = Session.getActiveUser().getEmail();
    logSheet.appendRow([alertId, 'Handled', note, new Date(), userEmail]);
    return true;
}

/**
 * NEW: Fetches dummy geo data for an address. This is a placeholder.
 * @param {string} address - The address to geocode.
 * @returns {{lat: number, lon: number}} Dummy coordinates.
 */
function getMapGeo(address) {
    // This is a mock function. In a real scenario, you'd use a Geocoding API.
    // We'll return a fixed location for demonstration.
    return {
        lat: 31.0461,
        lon: 34.8516
    };
}
