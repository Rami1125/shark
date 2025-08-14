document.addEventListener('DOMContentLoaded', () => {
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

    // Action buttons
    const addOrderBtn = document.getElementById('addOrderBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const toggleClosedBtn = document.getElementById('toggleClosedBtn');
    const containersOnSitesBtn = document.getElementById('containersOnSitesBtn');

    let showAllOrders = false; // State for toggling closed orders

    // Mock Data - Simulates data fetched from Google Apps Script
    // In a real application, this would come from the backend.
    let mockOrdersData = [
        {
            id: 'ORD001',
            docId: 'DOC123',
            clientName: 'לקוח א׳ בע״מ',
            address: 'רחוב הרצל 1, תל אביב',
            actionType: 'הצבה',
            startDate: '2025-07-01',
            containerNum: 'C-001',
            status: 'פתוחה',
            endDate: '2025-07-15', // Calculated mock
            daysLeft: 5, // Calculated mock
            isOverdue: false,
            duplicateFlags: []
        },
        {
            id: 'ORD002',
            docId: 'DOC124',
            clientName: 'לקוח ב׳ פתרונות',
            address: 'דרך יפו 50, חיפה',
            actionType: 'החלפה',
            startDate: '2025-07-05',
            containerNum: 'C-002',
            status: 'פתוחה',
            endDate: '2025-07-19',
            daysLeft: 9,
            isOverdue: false,
            duplicateFlags: []
        },
        {
            id: 'ORD003',
            docId: 'DOC125',
            clientName: 'לקוח ג׳ שירותים',
            address: 'שדרות ירושלים 100, ירושלים',
            actionType: 'הצבה',
            startDate: '2025-06-20',
            containerNum: 'C-003',
            status: 'פתוחה',
            endDate: '2025-07-04',
            daysLeft: -10, // Overdue example
            isOverdue: true,
            duplicateFlags: ['container-duplicate']
        },
        {
            id: 'ORD004',
            docId: 'DOC126',
            clientName: 'לקוח ד׳ בנייה',
            address: 'רחוב הנגב 15, באר שבע',
            actionType: 'הוצאה',
            startDate: '2025-06-01',
            containerNum: 'C-004',
            status: 'סגורה',
            endDate: '2025-06-15',
            daysLeft: null,
            isOverdue: false,
            duplicateFlags: []
        },
        {
            id: 'ORD005',
            docId: 'DOC127',
            clientName: 'לקוח א׳ בע״מ', // Duplicate client name for fuzzy match
            address: 'רחוב הרצל 1א, תל אביב', // Similar address
            actionType: 'הצבה',
            startDate: '2025-07-10',
            containerNum: 'C-005',
            status: 'פתוחה',
            endDate: '2025-07-24',
            daysLeft: 14,
            isOverdue: false,
            duplicateFlags: ['client-fuzzy-address']
        },
        {
            id: 'ORD006',
            docId: 'DOC128',
            clientName: 'לקוח ה׳ שילוח',
            address: 'רחוב הפרחים 20, רעננה',
            actionType: 'הצבה',
            startDate: '2025-07-12',
            containerNum: 'C-003', // Duplicate container number
            status: 'פתוחה',
            endDate: '2025-07-26',
            daysLeft: 16,
            isOverdue: false,
            duplicateFlags: ['container-duplicate']
        }
    ];

    /**
     * Calculates the end date based on start date and 10 business days.
     * This is a simplified client-side calculation.
     * A more robust version would handle holidays and exact business day logic.
     * @param {string} startDateString - Start date in YYYY-MM-DD format.
     * @returns {string} End date in YYYY-MM-DD format.
     */
    function calculateEndDate(startDateString) {
        let date = new Date(startDateString);
        let businessDaysAdded = 0;
        let days = 0;
        while (businessDaysAdded < 10) {
            date.setDate(date.getDate() + 1);
            let dayOfWeek = date.getDay();
            // 0 = Sunday, 6 = Saturday. Skip weekends.
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                businessDaysAdded++;
            }
            days++;
            // Prevent infinite loop in case of bad logic (though unlikely here)
            if (days > 30) break;
        }
        return date.toISOString().split('T')[0];
    }

    /**
     * Calculates days left until end date.
     * @param {string} endDateString - End date in YYYY-MM-DD format.
     * @returns {number} Days remaining. Negative if overdue.
     */
    function calculateDaysLeft(endDateString) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const endDate = new Date(endDateString);
        endDate.setHours(0, 0, 0, 0); // Normalize to start of day
        const diffTime = endDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }

    /**
     * Updates mock data with calculated fields (endDate, daysLeft, isOverdue).
     * In a real app, these calculations might be done on the backend.
     */
    function processMockData() {
        mockOrdersData.forEach(order => {
            if (order.actionType === 'הצבה' || order.actionType === 'החלפה') {
                order.endDate = calculateEndDate(order.startDate);
                order.daysLeft = calculateDaysLeft(order.endDate);
                order.isOverdue = order.daysLeft < 0;
            } else {
                order.endDate = null;
                order.daysLeft = null;
                order.isOverdue = false;
            }
        });
    }

    /**
     * Renders the orders table based on the current data and filters.
     */
    function renderTable() {
        ordersTableBody.innerHTML = ''; // Clear existing rows
        const filteredOrders = showAllOrders ? mockOrdersData : mockOrdersData.filter(order => order.status !== 'סגורה');

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
                <td data-label="תעודה:" class="py-3 px-4 text-white font-semibold">${order.docId}</td>
                <td data-label="לקוח:" class="py-3 px-4 text-white font-semibold">${order.clientName}</td>
                <td data-label="כתובת:" class="py-3 px-4 text-white text-opacity-90">${order.address}</td>
                <td data-label="סוג פעולה:" class="py-3 px-4 text-white text-opacity-90">${order.actionType}</td>
                <td data-label="תאריך התחלה:" class="py-3 px-4 text-white text-opacity-90">${order.startDate}</td>
                <td data-label="תאריך סיום:" class="py-3 px-4 text-white text-opacity-90">${order.endDate || 'N/A'}</td>
                <td data-label="ימים נותרו:" class="py-3 px-4 text-white text-opacity-90">${order.daysLeft !== null ? order.daysLeft : 'N/A'}</td>
                <td data-label="מס' מכולה:" class="py-3 px-4 text-white font-semibold">${order.containerNum}</td>
                <td data-label="סטטוס:" class="py-3 px-4 text-white text-opacity-90">
                    <span class="status-badge ${order.status === 'פתוחה' ? 'bg-green-500' : 'bg-gray-500'} rounded-full px-3 py-1 text-xs font-bold">
                        ${order.status}
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
                        <button class="action-icon-btn history-btn" data-id="${order.id}" data-client="${order.clientName}" data-address="${order.address}" data-container="${order.containerNum}" title="הצג היסטוריה">
                            <i class="fas fa-history"></i>
                            <span class="tooltiptext">הצג היסטוריה</span>
                        </button>
                    </div>
                </td>
            `;
            ordersTableBody.appendChild(row);
        });

        // Add event listeners for new buttons
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => showToast(`ערוך הזמנה ${e.currentTarget.dataset.id}`, 'info'));
        });
        document.querySelectorAll('.duplicate-btn').forEach(button => {
            button.addEventListener('click', (e) => showConfirmPopup(`האם אתה בטוח שברצונך לשכפל את הזמנה ${e.currentTarget.dataset.id}?`, () => showToast(`הזמנה ${e.currentTarget.dataset.id} שוכפלה (בפועל, נדרש קוד backend)`, 'success')));
        });
        document.querySelectorAll('.close-open-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const orderId = e.currentTarget.dataset.id;
                const currentStatus = e.currentTarget.dataset.status;
                const newStatus = currentStatus === 'פתוחה' ? 'סגורה' : 'פתוחה';
                showConfirmPopup(`האם אתה בטוח שברצונך ${newStatus === 'סגורה' ? 'לסגור' : 'לפתוח'} את הזמנה ${orderId}?`, () => {
                    const orderIndex = mockOrdersData.findIndex(order => order.id === orderId);
                    if (orderIndex !== -1) {
                        mockOrdersData[orderIndex].status = newStatus;
                        updateKPIs();
                        renderTable(); // Re-render to reflect status change
                        showToast(`הזמנה ${orderId} עודכנה לסטטוס: ${newStatus}`, 'success');
                    }
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
            button.addEventListener('click', (e) => {
                const { client, address, container } = e.currentTarget.dataset;
                showOrderHistoryPopup(client, address, container);
            });
        });

        // Icon button styling (Tailwind applied directly in HTML)
        // This is a placeholder for potential custom icon button styles.
        document.querySelectorAll('.action-icon-btn').forEach(btn => {
            btn.classList.add('w-8', 'h-8', 'rounded-full', 'bg-white', 'bg-opacity-20', 'flex', 'items-center', 'justify-center', 'text-white', 'text-sm', 'hover:bg-opacity-30', 'transition', 'duration-200', 'relative', 'group');
        });
    }

    /**
     * Updates the KPI cards with current data counts.
     */
    function updateKPIs() {
        const openOrders = mockOrdersData.filter(order => order.status === 'פתוחה').length;
        const overdueOrders = mockOrdersData.filter(order => order.isOverdue).length;
        const expiringOrders = mockOrdersData.filter(order => order.status === 'פתוחה' && order.daysLeft >= 0 && order.daysLeft <= 3).length;
        const duplicateContainers = new Set();
        const seenContainers = new Set();
        mockOrdersData.forEach(order => {
            if (order.status === 'פתוחה' && seenContainers.has(order.containerNum)) {
                duplicateContainers.add(order.containerNum);
            }
            seenContainers.add(order.containerNum);
        });
        // This is a simplified duplicate check. A real duplicate check would involve the 'duplicateFlags' property.
        // For now, let's use the container number as a simple example.
        const totalDuplicates = mockOrdersData.filter(order => order.duplicateFlags.length > 0).length;


        kpiOpen.textContent = openOrders;
        kpiOverdue.textContent = overdueOrders;
        kpiExpiring.textContent = expiringOrders;
        kpiDuplicates.textContent = totalDuplicates; // Update based on mock duplicate flags

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
        const modalActionsDiv = document.getElementById('modalActions');
        modalActionsDiv.innerHTML = '';
        actions.forEach(action => {
            const btn = document.createElement('button');
            btn.textContent = action.text;
            btn.classList.add('py-2', 'px-4', 'rounded-lg', 'font-semibold', 'transition', 'duration-200', 'hover:opacity-80', 'flex-grow'); // Added flex-grow
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
        document.getElementById('modalActions').innerHTML = '';
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
     * This uses mock data, in real app would fetch from backend.
     * @param {string} clientName
     * @param {string} address
     * @param {string} containerNum
     */
    function showOrderHistoryPopup(clientName, address, containerNum) {
        const historyOrders = mockOrdersData.filter(order =>
            order.clientName === clientName ||
            order.address.includes(address.split(',')[0]) || // Simple fuzzy match on street name
            order.containerNum === containerNum
        );

        let contentHtml = `<p class="mb-4">היסטוריית הזמנות עבור ${clientName || 'N/A'}:</p>`;
        if (historyOrders.length > 0) {
            contentHtml += `
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-700 bg-opacity-50">
                            <tr>
                                <th class="py-2 px-3 text-right">תעודה</th>
                                <th class="py-2 px-3 text-right">סוג</th>
                                <th class="py-2 px-3 text-right">תאריך</th>
                                <th class="py-2 px-3 text-right">מכולה</th>
                                <th class="py-2 px-3 text-right">סטטוס</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            historyOrders.forEach(order => {
                contentHtml += `
                    <tr class="border-t border-gray-600 border-opacity-50">
                        <td class="py-2 px-3">${order.docId}</td>
                        <td class="py-2 px-3">${order.actionType}</td>
                        <td class="py-2 px-3">${order.startDate}</td>
                        <td class="py-2 px-3">${order.containerNum}</td>
                        <td class="py-2 px-3">${order.status}</td>
                    </tr>
                `;
            });
            contentHtml += `
                        </tbody>
                    </table>
                </div>
                <div class="mt-4 text-center text-xs text-white text-opacity-70">
                    (זוהי היסטוריה חלקית מנתוני הדוגמה.)
                </div>
            `;
        } else {
            contentHtml += `<p class="text-center text-gray-400">לא נמצאה היסטוריית הזמנות.</p>`;
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

        // Remove toast after duration
        setTimeout(() => {
            toast.classList.remove('active'); // Start fade out if any custom fade logic
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => {
                toast.remove();
            }, 500); // Allow time for CSS transition
        }, duration);
    }


    // Event Listeners for Header Buttons
    addOrderBtn.addEventListener('click', () => showToast('פתיחת טופס הוספת הזמנה חדשה', 'info'));
    refreshBtn.addEventListener('click', () => {
        showToast('מרענן נתונים...', 'info');
        // In a real app, this would trigger a fetch from backend
        processMockData(); // Re-process data
        updateKPIs();
        renderTable();
    });
    toggleClosedBtn.addEventListener('click', () => {
        showAllOrders = !showAllOrders;
        toggleClosedBtn.textContent = showAllOrders ? 'הצג פתוחות בלבד' : 'הצג סגורות';
        toggleClosedBtn.querySelector('i').className = showAllOrders ? 'fas fa-eye-slash ml-2' : 'fas fa-eye ml-2';
        renderTable();
        showToast(showAllOrders ? 'מציג את כל ההזמנות כולל סגורות' : 'מציג הזמנות פתוחות בלבד', 'info');
    });
    containersOnSitesBtn.addEventListener('click', () => showToast('מעבר לדף "מכולות באתרים"', 'info'));

    // Modal close button
    closeModalBtn.addEventListener('click', hideModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) { // Close only if clicked on overlay, not content
            hideModal();
        }
    });

    // View Alerts Button in the alerts bar
    viewAlertsBtn.addEventListener('click', () => {
        const overdue = mockOrdersData.filter(order => order.isOverdue);
        const duplicateIssueOrders = mockOrdersData.filter(order => order.duplicateFlags.length > 0);

        let content = '';
        if (overdue.length > 0) {
            content += `<h3 class="font-bold mb-2">הזמנות חורגות (${overdue.length}):</h3>`;
            content += `<ul class="list-disc pr-5 mb-4 text-sm">`;
            overdue.forEach(o => content += `<li>${o.clientName} - ${o.containerNum} (חורג ב-${Math.abs(o.daysLeft)} ימים)</li>`);
            content += `</ul>`;
        }
        if (duplicateIssueOrders.length > 0) {
            content += `<h3 class="font-bold mb-2">הזמנות עם כפילויות (${duplicateIssueOrders.length}):</h3>`;
            content += `<ul class="list-disc pr-5 text-sm">`;
            duplicateIssueOrders.forEach(o => {
                let flagsText = o.duplicateFlags.map(flag => {
                    if (flag === 'container-duplicate') return 'כפילות מספר מכולה';
                    if (flag === 'client-fuzzy-address') return 'כתובת דומה (ייתכן כפילות לקוח)';
                    return flag;
                }).join(', ');
                content += `<li>${o.clientName} - ${o.containerNum} (בעיות: ${flagsText})</li>`;
            });
            content += `</ul>`;
        }

        showModal('פרטי התראות', content);
    });

    // Initial load
    processMockData();
    updateKPIs();
    renderTable();
});
