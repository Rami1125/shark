document.addEventListener('DOMContentLoaded', () => {
    // --- הגדרות גלובליות ---
    // יש להחליף את ה-URL הזה בכתובת ה-URL של ה-Web App שפרסתם מ-Google Apps Script.
    // ודאו שכתובת ה-URL מסתיימת ב-`/exec`
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbycOHeM6jyivyEuYBC5ovuL1cs9WBv6FvWbZDxJaBhIXqf9MkbA_bJKG0COXKdYJzkM/exec';

    // DOM elements
    const ordersTableBody = document.getElementById('ordersTableBody');
    const kpiOpen = document.getElementById('kpiOpen');
    const kpiOverdue = document.getElementById('kpiOverdue');
    const kpiExpiring = document.getElementById('kpiExpiring');
    const kpiDuplicates = document.getElementById('kpiDuplicates');
    const alertsBar = document.getElementById('alertsBar');
    const alertsText = document.getElementById('alertsText');
    const viewAlertsBtn = document.getElementById('viewAlertsBtn');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalContent = document.getElementById('modalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const toastContainer = document.getElementById('toastContainer');
    const modalActionsDiv = document.createElement('div'); // Create modal actions div globally
    modalActionsDiv.id = 'modalActions';
    modalActionsDiv.classList.add('flex', 'justify-end', 'mt-6', 'gap-3');


    // Action buttons
    const addOrderBtn = document.getElementById('addOrderBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const toggleClosedBtn = document.getElementById('toggleClosedBtn');
    const containersOnSitesBtn = document.getElementById('containersOnSitesBtn');

    let showAllOrders = false; // State for toggling closed orders
    let currentOrdersData = []; // Stores the data fetched from GAS


    // --- פונקציות תקשורת עם ה-Backend (Google Apps Script) ---

    /**
     * Generic fetch function with exponential backoff for GAS API calls.
     * @param {string} url The URL for the fetch request.
     * @param {Object} options Fetch options (method, headers, body).
     * @param {number} retries Current retry count.
     * @returns {Promise<Object>} The JSON response data.
     */
    async function fetchData(url, options = {}, retries = 0) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                // If response is not OK, try to parse JSON error or use status text
                const errorText = await response.text();
                throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            if (retries < 3) { // Max 3 retries (total 4 attempts)
                const delay = Math.pow(2, retries) * 1000; // 1s, 2s, 4s
                console.warn(`Attempt ${retries + 1} failed for ${url}. Retrying in ${delay / 1000}s...`, error);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchData(url, options, retries + 1);
            } else {
                console.error(`Fetch failed after ${retries} retries:`, error);
                showToast(`שגיאה בטעינת הנתונים: ${error.message}`, 'error');
                throw error;
            }
        }
    }

    /**
     * Fetches orders from the GAS backend.
     * @param {boolean} includeClosed - Whether to fetch all orders or only open ones.
     * @returns {Promise<Array<Object>>} List of order objects.
     */
    async function fetchOrders(includeClosed = false) {
        showToast('טוען נתונים...', 'info');
        const showParam = includeClosed ? 'all' : 'open';
        try {
            const response = await fetchData(`${WEB_APP_URL}?action=list&show=${showParam}`);
            if (response.success) {
                currentOrdersData = response.data;
                showToast('נתונים נטענו בהצלחה', 'success');
                return currentOrdersData;
            } else {
                throw new Error(response.error || 'שגיאה בטעינת הזמנות.');
            }
        } catch (error) {
            console.error('Error fetching orders:', error);
            showToast(`שגיאה בטעינת הזמנות: ${error.message}`, 'error');
            return [];
        }
    }

    /**
     * Adds a new order via the GAS backend.
     * @param {Object} orderData The order data.
     */
    async function addOrderToBackend(orderData) {
        showToast('מוסיף הזמנה...', 'info');
        try {
            const response = await fetchData(WEB_APP_URL + '?action=add', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' }, // GAS expects text/plain for raw body
                body: JSON.stringify({ orderData: orderData })
            });
            if (response.success) {
                showToast('הזמנה נוספה בהצלחה!', 'success');
                await initializeAppData(); // Re-fetch and re-render
            } else {
                throw new Error(response.error || 'שגיאה בהוספת הזמנה.');
            }
        } catch (error) {
            console.error('Error adding order:', error);
            showToast(`שגיאה בהוספת הזמנה: ${error.message}`, 'error');
        }
    }

    /**
     * Edits an existing order via the GAS backend.
     * @param {string} id The ID of the order to edit.
     * @param {Object} updatedData The updated data.
     */
    async function editOrderInBackend(id, updatedData) {
        showToast('מעדכן הזמנה...', 'info');
        try {
            const response = await fetchData(`${WEB_APP_URL}?action=edit&id=${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ orderData: updatedData })
            });
            if (response.success) {
                showToast('הזמנה עודכנה בהצלחה!', 'success');
                await initializeAppData();
            } else {
                throw new Error(response.error || 'שגיאה בעדכון הזמנה.');
            }
        } catch (error) {
            console.error('Error editing order:', error);
            showToast(`שגיאה בעדכון הזמנה: ${error.message}`, 'error');
        }
    }

    /**
     * Duplicates an order via the GAS backend.
     * @param {string} id The ID of the order to duplicate.
     */
    async function duplicateOrderInBackend(id) {
        showToast('משכפל הזמנה...', 'info');
        try {
            const response = await fetchData(`${WEB_APP_URL}?action=duplicate&id=${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({}) // Empty body for POST
            });
            if (response.success) {
                showToast('הזמנה שוכפלה בהצלחה!', 'success');
                await initializeAppData();
            } else {
                throw new Error(response.error || 'שגיאה בשכפול הזמנה.');
            }
        } catch (error) {
            console.error('Error duplicating order:', error);
            showToast(`שגיאה בשכפול הזמנה: ${error.message}`, 'error');
        }
    }

    /**
     * Closes an order via the GAS backend.
     * @param {string} id The ID of the order to close.
     */
    async function closeOrderInBackend(id) {
        showToast('סוגר הזמנה...', 'info');
        try {
            const response = await fetchData(`${WEB_APP_URL}?action=close&id=${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({}) // Empty body for POST
            });
            if (response.success) {
                showToast('הזמנה נסגרה בהצלחה!', 'success');
                await initializeAppData();
            } else {
                throw new Error(response.error || 'שגיאה בסגירת הזמנה.');
            }
        } catch (error) {
            console.error('Error closing order:', error);
            showToast(`שגיאה בסגירת הזמנה: ${error.message}`, 'error');
        }
    }

    /**
     * Fetches order history from the GAS backend.
     * @param {string} clientName
     * @param {string} address
     * @param {string} containerNum
     * @returns {Promise<Array<Object>>} List of historical orders.
     */
    async function fetchOrderHistory(clientName, address, containerNum) {
        showToast('טוען היסטוריית הזמנות...', 'info');
        const url = new URL(WEB_APP_URL);
        url.searchParams.append('action', 'history');
        if (clientName) url.searchParams.append('client', clientName);
        if (address) url.searchParams.append('address', address);
        if (containerNum) url.searchParams.append('container', containerNum);

        try {
            const response = await fetchData(url.toString());
            if (response.success) {
                showToast('היסטוריה נטענה בהצלחה', 'success');
                return response.data;
            } else {
                throw new Error(response.error || 'שגיאה בטעינת היסטוריה.');
            }
        } catch (error) {
            console.error('Error fetching history:', error);
            showToast(`שגיאה בטעינת היסטוריה: ${error.message}`, 'error');
            return [];
        }
    }


    // --- פונקציות עיבוד ורינדור UI ---

    /**
     * Renders the orders table based on the current data and filters.
     */
    function renderTable() {
        ordersTableBody.innerHTML = ''; // Clear existing rows
        const filteredOrders = showAllOrders ? currentOrdersData : currentOrdersData.filter(order => order.status !== 'סגורה');

        if (filteredOrders.length === 0) {
            ordersTableBody.innerHTML = `<tr><td colspan="10" class="py-4 text-center text-gray-400">אין הזמנות להצגה</td></tr>`;
            return;
        }

        filteredOrders.forEach(order => {
            const row = document.createElement('tr');
            row.classList.add('table-row-card', 'glass-effect', 'my-2', 'block', 'md:table-row'); // Apply card style
            if (order.isOverdue) {
                row.classList.add('overdue-row');
            }

            row.innerHTML = `
                <td data-label="תעודה:" class="py-3 px-4 text-white font-semibold">${order.docId || 'N/A'}</td>
                <td data-label="לקוח:" class="py-3 px-4 text-white font-semibold">${order.clientName || 'N/A'}</td>
                <td data-label="כתובת:" class="py-3 px-4 text-white text-opacity-90">${order.address || 'N/A'}</td>
                <td data-label="סוג פעולה:" class="py-3 px-4 text-white text-opacity-90">${order.actionType || 'N/A'}</td>
                <td data-label="תאריך התחלה:" class="py-3 px-4 text-white text-opacity-90">${order.startDate || 'N/A'}</td>
                <td data-label="תאריך סיום:" class="py-3 px-4 text-white text-opacity-90">${order.endDate || 'N/A'}</td>
                <td data-label="ימים נותרו:" class="py-3 px-4 text-white text-opacity-90">${order.daysLeft !== null && order.daysLeft !== undefined ? order.daysLeft : 'N/A'}</td>
                <td data-label="מס' מכולה:" class="py-3 px-4 text-white font-semibold">${order.containerNum || 'N/A'}</td>
                <td data-label="סטטוס:" class="py-3 px-4 text-white text-opacity-90">
                    <span class="status-badge ${order.status === 'פתוחה' ? 'bg-green-500' : 'bg-gray-500'} rounded-full px-3 py-1 text-xs font-bold">
                        ${order.status || 'N/A'}
                    </span>
                </td>
                <td data-label="פעולות:" class="py-3 px-4">
                    <div class="flex flex-wrap gap-2 justify-end md:justify-start">
                        <button class="action-icon-btn edit-btn" data-id="${order.id}" title="ערוך">
                            <i class="fas fa-edit"></i>
                            <span class="tooltiptext">ערוך</span>
                        </button>
                        <button class="action-icon-btn duplicate-btn" data-id="${order.id}" title="שכפל">
                            <i class="fas fa-copy"></i>
                            <span class="tooltiptext">שכפל</span>
                        </button>
                        <button class="action-icon-btn close-open-btn" data-id="${order.id}" data-status="${order.status}" title="${order.status === 'פתוחה' ? 'סגור' : 'פתח'}">
                            <i class="fas fa-${order.status === 'פתוחה' ? 'times-circle' : 'check-circle'}"></i>
                            <span class="tooltiptext">${order.status === 'פתוחה' ? 'סגור' : 'פתח'}</span>
                        </button>
                        ${order.actionType === 'הצבה' ? `<button class="action-icon-btn convert-btn" data-id="${order.id}" title="המר להחלפה">
                            <i class="fas fa-exchange-alt"></i>
                            <span class="tooltiptext">המר להחלפה</span>
                        </button>` : ''}
                        <button class="action-icon-btn whatsapp-btn" data-id="${order.id}" title="שלח וואטסאפ">
                            <i class="fab fa-whatsapp"></i>
                            <span class="tooltiptext">שלח וואטסאפ</span>
                        </button>
                        <button class="action-icon-btn history-btn" data-id="${order.id}" data-client="${order.clientName || ''}" data-address="${order.address || ''}" data-container="${order.containerNum || ''}" title="הצג היסטוריה">
                            <i class="fas fa-history"></i>
                            <span class="tooltiptext">הצג היסטוריה</span>
                        </button>
                    </div>
                </td>
            `;
            ordersTableBody.appendChild(row);
        });

        // Add event listeners for new buttons
        attachTableButtonListeners();
    }

    /**
     * Attaches event listeners to action buttons within the table.
     * Called after rendering the table.
     */
    function attachTableButtonListeners() {
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => showToast(`ערוך הזמנה ${e.currentTarget.dataset.id}`, 'info'));
        });
        document.querySelectorAll('.duplicate-btn').forEach(button => {
            button.addEventListener('click', (e) => showConfirmPopup(`האם אתה בטוח שברצונך לשכפל את הזמנה ${e.currentTarget.dataset.id}?`, () => duplicateOrderInBackend(e.currentTarget.dataset.id)));
        });
        document.querySelectorAll('.close-open-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const currentStatus = e.currentTarget.dataset.status;
                const newStatusAction = currentStatus === 'פתוחה' ? 'לסגור' : 'לפתוח';
                showConfirmPopup(`האם אתה בטוח שברצונך ${newStatusAction} את הזמנה ${orderId}?`, () => {
                    closeOrderInBackend(orderId); // Call close endpoint, which will update status to 'סגורה'
                                                // If 'פתח' is needed, a separate backend action for 'open' would be required.
                });
            });
        });
        document.querySelectorAll('.convert-btn').forEach(button => {
            button.addEventListener('click', (e) => showToast(`המר הזמנה ${e.currentTarget.dataset.id} להחלפה`, 'info'));
        });
        document.querySelectorAll('.whatsapp-btn').forEach(button => {
            button.addEventListener('click', (e) => showToast(`שליחת וואטסאפ עבור הזמנה ${e.currentTarget.dataset.id}`, 'info'));
        });
        document.querySelectorAll('.history-btn').forEach(button => {
            button.addEventListener('click', async (e) => {
                const { client, address, container } = e.currentTarget.dataset;
                const historyData = await fetchOrderHistory(client, address, container);
                showOrderHistoryPopup(client, address, container, historyData);
            });
        });

        // Icon button styling (Tailwind applied directly in HTML)
        document.querySelectorAll('.action-icon-btn').forEach(btn => {
            btn.classList.add('w-8', 'h-8', 'rounded-full', 'bg-white', 'bg-opacity-20', 'flex', 'items-center', 'justify-center', 'text-white', 'text-sm', 'hover:bg-opacity-30', 'transition', 'duration-200', 'relative', 'group');
        });
    }

    /**
     * Updates the KPI cards with current data counts.
     */
    function updateKPIs() {
        const openOrders = currentOrdersData.filter(order => order.status === 'פתוחה').length;
        const overdueOrders = currentOrdersData.filter(order => order.isOverdue).length;
        const expiringOrders = currentOrdersData.filter(order => order.status === 'פתוחה' && order.daysLeft >= 0 && order.daysLeft <= 3).length;

        // Count duplicates based on the 'duplicateFlags' array
        const totalDuplicates = currentOrdersData.filter(order => order.duplicateFlags && order.duplicateFlags.length > 0).length;


        kpiOpen.textContent = openOrders;
        kpiOverdue.textContent = overdueOrders;
        kpiExpiring.textContent = expiringOrders;
        kpiDuplicates.textContent = totalDuplicates;

        if (overdueOrders > 0 || totalDuplicates > 0) {
            alertsBar.classList.remove('hidden');
            let alertMessages = [];
            if (overdueOrders > 0) {
                alertMessages.push(`${overdueOrders} הזמנות חורגות`);
            }
            if (totalDuplicates > 0) {
                alertMessages.push(`${totalDuplicates} הזמנות עם כפילויות`);
            }
            alertsText.textContent = alertMessages.join(' ו-');
        } else {
            alertsBar.classList.add('hidden');
        }
    }

    /**
     * Shows a generic modal popup.
     * @param {string} title - Title of the modal.
     * @param {string} content - HTML content for the modal body.
     * @param {Array<Object>} [actions=[]] - Array of action buttons { text, className, onClick }.
     */
    function showModal(title, content, actions = []) {
        modalTitle.textContent = title;
        modalContent.innerHTML = content;
        // Append or replace modalActionsDiv content
        let existingModalActions = document.getElementById('modalActions');
        if (existingModalActions) {
            existingModalActions.remove(); // Remove old one
        }
        modalContent.parentElement.appendChild(modalActionsDiv); // Re-append it to the modal body's parent
        modalActionsDiv.innerHTML = ''; // Clear actions

        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.textContent = action.text;
            btn.classList.add('py-2', 'px-4', 'rounded-lg', 'font-semibold', 'transition', 'duration-200', 'hover:opacity-80', 'flex-grow');
            if (action.className) btn.classList.add(...action.className.split(' '));
            if (action.onClick) btn.addEventListener('click', action.onClick);
            modalActionsDiv.appendChild(btn);
        });

        modalOverlay.classList.add('active');
    }

    /**
     * Hides the generic modal popup.
     */
    function hideModal() {
        modalOverlay.classList.remove('active');
        // Clear content to prevent lingering data
        modalContent.innerHTML = '';
        document.getElementById('modalActions').innerHTML = ''; // Clear actions div
    }

    /**
     * Displays a confirmation popup.
     * @param {string} message - Confirmation message.
     * @param {function} onConfirm - Callback function if confirmed.
     */
    function showConfirmPopup(message, onConfirm) {
        const content = `<p class="text-lg">${message}</p>`;
        const actions = [
            {
                text: 'כן',
                className: 'bg-green-500 text-white',
                onClick: () => {
                    onConfirm();
                    hideModal();
                }
            },
            {
                text: 'ביטול',
                className: 'bg-gray-500 text-white',
                onClick: hideModal
            }
        ];
        showModal('אישור פעולה', content, actions);
    }

    /**
     * Displays a popup with order history for a given client/address/container.
     * @param {string} clientName
     * @param {string} address
     * @param {string} containerNum
     * @param {Array<Object>} historyData - Data fetched from backend.
     */
    function showOrderHistoryPopup(clientName, address, containerNum, historyData) {
        let contentHtml = `<p class="mb-4">היסטוריית הזמנות עבור ${clientName || 'N/A'} (קשור לכתובת: ${address || 'N/A'}, מכולה: ${containerNum || 'N/A'}):</p>`;
        if (historyData && historyData.length > 0) {
            contentHtml += `
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-700 bg-opacity-50">
                            <tr>
                                <th class="py-2 px-3 text-right">תעודה</th>
                                <th class="py-2 px-3 text-right">לקוח</th>
                                <th class="py-2 px-3 text-right">כתובת</th>
                                <th class="py-2 px-3 text-right">סוג פעולה</th>
                                <th class="py-2 px-3 text-right">תאריך התחלה</th>
                                <th class="py-2 px-3 text-right">מכולה</th>
                                <th class="py-2 px-3 text-right">סטטוס</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            historyData.forEach(order => {
                contentHtml += `
                    <tr class="border-t border-gray-600 border-opacity-50">
                        <td class="py-2 px-3">${order.docId || 'N/A'}</td>
                        <td class="py-2 px-3">${order.clientName || 'N/A'}</td>
                        <td class="py-2 px-3">${order.address || 'N/A'}</td>
                        <td class="py-2 px-3">${order.actionType || 'N/A'}</td>
                        <td class="py-2 px-3">${order.startDate || 'N/A'}</td>
                        <td class="py-2 px-3">${order.containerNum || 'N/A'}</td>
                        <td class="py-2 px-3">${order.status || 'N/A'}</td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            contentHtml += `<p class="text-center text-gray-400">לא נמצאה היסטוריית הזמנות עבור הפרמטרים שסופקו.</p>`;
        }

        showModal('הצג היסטוריה', contentHtml);
    }

    /**
     * Shows a toast notification.
     * @param {string} message - Message to display.
     * @param {string} type - 'success', 'error', 'warning', 'info'.
     * @param {number} duration - How long the toast stays (in ms).
     */
    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.classList.add('toast', type, 'transition-all', 'duration-500', 'ease-in-out');
        toast.textContent = message;

        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => {
                toast.remove();
            }, 500); // Allow time for CSS transition
        }, duration);
    }


    // --- פונקציות אתחול ---

    /**
     * Initializes the application data by fetching from backend and rendering.
     */
    async function initializeAppData() {
        await fetchOrders(showAllOrders); // Fetch data based on current filter preference
        updateKPIs();
        renderTable();
    }


    // --- Event Listeners for Header Buttons ---
    addOrderBtn.addEventListener('click', () => {
        // Example for adding a new order (form would be needed)
        // For now, it's just a toast message.
        showToast('פתיחת טופס הוספת הזמנה חדשה (פונקציונליות טופס תתווסף בהמשך)', 'info');
        // Example: addOrderToBackend({ docId: 'NEW001', clientName: 'לקוח חדש', address: 'רחוב העצמאות 1', actionType: 'הצבה', startDate: '2025-08-15', containerNum: 'C-XYZ' });
    });

    refreshBtn.addEventListener('click', initializeAppData);

    toggleClosedBtn.addEventListener('click', () => {
        showAllOrders = !showAllOrders;
        toggleClosedBtn.innerHTML = showAllOrders ? `<i class="fas fa-eye-slash ml-2"></i>הצג פתוחות בלבד` : `<i class="fas fa-eye ml-2"></i>הצג סגורות`;
        initializeAppData();
        showToast(showAllOrders ? 'מציג את כל ההזמנות כולל סגורות' : 'מציג הזמנות פתוחות בלבד', 'info');
    });

    containersOnSitesBtn.addEventListener('click', () => showToast('מעבר לדף "מכולות באתרים" (יבנה בהמשך)', 'info'));

    // Modal close button
    closeModalBtn.addEventListener('click', hideModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) { // Close only if clicked on overlay, not content
            hideModal();
        }
    });

    // View Alerts Button in the alerts bar
    viewAlertsBtn.addEventListener('click', () => {
        const overdue = currentOrdersData.filter(order => order.isOverdue);
        const duplicateIssueOrders = currentOrdersData.filter(order => order.duplicateFlags && order.duplicateFlags.length > 0);

        let content = '';
        if (overdue.length > 0) {
            content += `<h3 class="font-bold mb-2 text-red-300">הזמנות חורגות (${overdue.length}):</h3>`;
            content += `<ul class="list-disc pr-5 mb-4 text-sm">`;
            overdue.forEach(o => content += `<li>תעודה: ${o.docId}, לקוח: ${o.clientName}, מכולה: ${o.containerNum} (חורג ב-${Math.abs(o.daysLeft)} ימים)</li>`);
            content += `</ul>`;
        }
        if (duplicateIssueOrders.length > 0) {
            content += `<h3 class="font-bold mb-2 text-orange-300">הזמנות עם כפילויות (${duplicateIssueOrders.length}):</h3>`;
            content += `<ul class="list-disc pr-5 text-sm">`;
            duplicateIssueOrders.forEach(o => {
                let flagsText = (o.duplicateFlags || []).map(flag => {
                    if (flag === 'container-duplicate') return 'כפילות מספר מכולה';
                    if (flag === 'client-fuzzy-address') return 'כתובת דומה (ייתכן כפילות לקוח)';
                    return flag;
                }).join(', ');
                content += `<li>תעודה: ${o.docId}, לקוח: ${o.clientName}, מכולה: ${o.containerNum} (בעיות: ${flagsText})</li>`;
            });
            content += `</ul>`;
        }

        if (content === '') {
            content = '<p class="text-center text-gray-400">אין התראות או כפילויות לטפל בהן כרגע. כל הכבוד! 🎉</p>';
        }

        showModal('פרטי התראות', content);
    });

    // Initial application load
    initializeAppData();
});
