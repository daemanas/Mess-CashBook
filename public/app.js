/* CashBook shared interactions */
(function () {
    'use strict';

    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    /* ---------- mobile sidebar ---------- */
    function initSidebar() {
        const body = document.body;
        const toggle = document.querySelector('.topbar-menu');
        const backdrop = document.querySelector('.sidebar-backdrop');
        if (!toggle) return;

        const setOpen = function (open) {
            body.classList.toggle('nav-open', open);
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        const close = function () { setOpen(false); };

        toggle.setAttribute('aria-expanded', 'false');

        toggle.addEventListener('click', function () {
            setOpen(!body.classList.contains('nav-open'));
        });

        if (backdrop) backdrop.addEventListener('click', close);

        document.querySelectorAll('.sidebar .nav-link').forEach(function (link) {
            link.addEventListener('click', close);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape') close();
        });
    }

    /* ---------- month picker ---------- */
    function initMonthPickers() {
        document.querySelectorAll('.month-picker').forEach(function (picker, index) {
            const trigger = picker.querySelector('.month-trigger');
            const panel = picker.querySelector('.month-panel');
            if (!trigger || !panel) return;

            if (!panel.id) panel.id = 'month-panel-' + index;
            trigger.setAttribute('aria-haspopup', 'dialog');
            trigger.setAttribute('aria-controls', panel.id);
            trigger.setAttribute('aria-expanded', 'false');

            const go = function (month, year) {
                const url = new URL(window.location.href);
                url.searchParams.set('month', month);
                url.searchParams.set('year', year);
                url.searchParams.delete('page');
                window.location.href = url.toString();
            };

            trigger.addEventListener('click', function (event) {
                event.stopPropagation();
                const isHidden = panel.hasAttribute('hidden');
                document.querySelectorAll('.month-panel').forEach(function (other) {
                    other.setAttribute('hidden', '');
                });
                document.querySelectorAll('.month-trigger').forEach(function (other) {
                    other.setAttribute('aria-expanded', 'false');
                });
                if (isHidden) {
                    panel.removeAttribute('hidden');
                    trigger.setAttribute('aria-expanded', 'true');
                }
            });

            panel.addEventListener('click', function (event) {
                event.stopPropagation();
            });

            panel.querySelectorAll('.month-cell[data-month]').forEach(function (cell) {
                cell.addEventListener('click', function () {
                    const year = panel.querySelector('.month-year');
                    go(cell.dataset.month, year ? year.value : new Date().getFullYear());
                });
            });

            const yearSelect = panel.querySelector('.month-year');
            if (yearSelect) {
                yearSelect.addEventListener('change', function () {
                    const active = panel.querySelector('.month-cell.is-active');
                    go(active ? active.dataset.month : new Date().getMonth() + 1, yearSelect.value);
                });
            }

            const reset = panel.querySelector('.month-reset');
            if (reset) {
                reset.addEventListener('click', function (event) {
                    event.preventDefault();
                    const url = new URL(window.location.href);
                    url.searchParams.delete('month');
                    url.searchParams.delete('year');
                    url.searchParams.delete('page');
                    window.location.href = url.toString();
                });
            }
        });

        document.addEventListener('click', function () {
            document.querySelectorAll('.month-panel').forEach(function (panel) {
                panel.setAttribute('hidden', '');
            });
            document.querySelectorAll('.month-trigger').forEach(function (trigger) {
                trigger.setAttribute('aria-expanded', 'false');
            });
        });
    }

    /* ---------- confirmation dialog ---------- */
    function buildConfirmModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'confirm-modal';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
            '<h2 id="confirm-title">Please confirm</h2>' +
            '<p id="confirm-message">Are you sure you want to continue?</p>' +
            '<div class="modal-actions">' +
            '<button type="button" class="btn btn-secondary" data-confirm-cancel>Cancel</button>' +
            '<button type="button" class="btn btn-danger" data-confirm-ok>Delete</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        return modal;
    }

    function initConfirm() {
        const forms = document.querySelectorAll('form[data-confirm]');
        if (!forms.length) return;

        const modal = buildConfirmModal();
        const message = modal.querySelector('#confirm-message');
        const ok = modal.querySelector('[data-confirm-ok]');
        const cancel = modal.querySelector('[data-confirm-cancel]');
        let pendingForm = null;

        const close = function () {
            modal.hidden = true;
            pendingForm = null;
        };

        forms.forEach(function (form) {
            form.addEventListener('submit', function (event) {
                if (form.dataset.confirmed === 'true') return;
                event.preventDefault();
                pendingForm = form;
                message.textContent = form.getAttribute('data-confirm') || 'Are you sure you want to continue?';
                ok.textContent = form.getAttribute('data-confirm-label') || 'Delete';
                modal.hidden = false;
                ok.focus();
            });
        });

        ok.addEventListener('click', function () {
            if (!pendingForm) return;
            pendingForm.dataset.confirmed = 'true';
            const submitter = pendingForm.querySelector('button[type="submit"], input[type="submit"]');
            if (submitter) {
                submitter.classList.add('is-loading');
                submitter.setAttribute('aria-busy', 'true');
                if ('disabled' in submitter) submitter.disabled = true;
            }
            pendingForm.submit();
        });
        cancel.addEventListener('click', close);
        modal.addEventListener('click', function (event) {
            if (event.target === modal) close();
        });
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && !modal.hidden) close();
        });
    }

    /* ---------- toast from query string ---------- */
    function initToasts() {
        const params = new URLSearchParams(window.location.search);
        const messages = {
            saved: 'Changes saved successfully.',
            deleted: 'Record deleted.',
            updated: 'Member updated.',
            removed: 'Member removed.',
            created: 'Created successfully.'
        };
        let message = null;
        Object.keys(messages).some(function (key) {
            if (params.get(key) === '1') {
                message = messages[key];
                return true;
            }
            return false;
        });
        if (!message) return;

        const stack = document.createElement('div');
        stack.className = 'toast-stack';
        stack.innerHTML =
            '<div class="toast" role="status">' +
            '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' +
            '<span></span></div>';
        stack.querySelector('span').textContent = message;
        document.body.appendChild(stack);

        setTimeout(function () {
            const toast = stack.querySelector('.toast');
            if (toast) toast.style.opacity = '0';
            setTimeout(function () { stack.remove(); }, 300);
        }, 3200);
    }

    /* ---------- expense row builder ---------- */
    function initExpenseRows() {
        const container = document.querySelector('[data-expense-rows]');
        if (!container) return;

        const totalEl = document.querySelector('[data-expense-total]');
        const template = container.querySelector('.expense-row');

        const updateTotal = function () {
            let total = 0;
            container.querySelectorAll('.expense-amount').forEach(function (input) {
                const value = Number(input.value);
                if (Number.isFinite(value)) total += value;
            });
            if (totalEl) {
                totalEl.textContent = '₹' + total.toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            }
        };

        const bindRow = function (row) {
            const remove = row.querySelector('[data-remove-row]');
            if (remove) {
                remove.addEventListener('click', function () {
                    if (container.querySelectorAll('.expense-row').length > 1) {
                        row.remove();
                    } else {
                        row.querySelectorAll('input').forEach(function (input) {
                            if (input.type !== 'date') input.value = '';
                        });
                    }
                    updateTotal();
                });
            }
            row.querySelectorAll('.expense-amount').forEach(function (input) {
                input.addEventListener('input', updateTotal);
            });
        };

        container.querySelectorAll('.expense-row').forEach(bindRow);

        const add = document.querySelector('[data-add-row]');
        if (add) {
            add.addEventListener('click', function () {
                const row = template.cloneNode(true);
                row.querySelectorAll('input').forEach(function (input) {
                    input.value = '';
                });
                row.querySelectorAll('.expense-amount').forEach(function (input) {
                    input.addEventListener('input', updateTotal);
                });
                bindRow(row);
                container.appendChild(row);
                const first = row.querySelector('input[name="vag_name"]');
                if (first) first.focus();
                updateTotal();
            });
        }

        updateTotal();
    }

    /* ---------- password visibility ---------- */
    function initPasswordToggles() {
        document.querySelectorAll('[data-password-toggle]').forEach(function (button) {
            const input = document.getElementById(button.getAttribute('data-password-toggle'));
            if (!input) return;
            button.addEventListener('click', function () {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                button.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
                button.classList.toggle('is-visible', isPassword);
            });
        });
    }

    /* ---------- registration type selector ---------- */
    function initRegistration() {
        const cards = document.querySelectorAll('input[name="accountMode"]');
        if (!cards.length) return;

        const messFields = document.querySelector('[data-mess-fields]');
        const createFields = document.querySelector('[data-create-fields]');
        const joinFields = document.querySelector('[data-join-fields]');
        const hiddenType = document.querySelector('input[name="accountType"]');
        const modes = document.querySelectorAll('input[name="messMode"]');

        const sync = function () {
            const mode = document.querySelector('input[name="accountMode"]:checked');
            const isMess = mode && mode.value === 'mess';
            const messMode = document.querySelector('input[name="messMode"]:checked');
            const isCreate = isMess && messMode && messMode.value === 'create';

            if (messFields) messFields.hidden = !isMess;
            if (createFields) createFields.hidden = !isCreate;
            if (joinFields) joinFields.hidden = !isMess || isCreate;

            if (hiddenType) {
                if (!mode) {
                    hiddenType.value = '';
                } else if (!isMess) {
                    hiddenType.value = 'personal';
                } else {
                    hiddenType.value = isCreate ? 'admin' : 'member';
                }
            }

            const nameInput = document.getElementById('messNameInput');
            const groupInput = document.getElementById('groupIdInput');
            if (nameInput) nameInput.required = isCreate;
            if (groupInput) groupInput.required = isMess && !isCreate && Boolean(messMode);
        };

        cards.forEach(function (card) { card.addEventListener('change', sync); });
        modes.forEach(function (mode) { mode.addEventListener('change', sync); });

        // Restore the state the server echoed back after a validation error.
        if (hiddenType && hiddenType.value === 'admin') {
            const create = document.querySelector('input[name="messMode"][value="create"]');
            const mess = document.querySelector('input[name="accountMode"][value="mess"]');
            if (create) create.checked = true;
            if (mess) mess.checked = true;
        } else if (hiddenType && hiddenType.value === 'member') {
            const join = document.querySelector('input[name="messMode"][value="join"]');
            const mess = document.querySelector('input[name="accountMode"][value="mess"]');
            if (join) join.checked = true;
            if (mess) mess.checked = true;
        }

        sync();
    }

    /* ---------- motion helpers ---------- */
    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    /* ---------- animated statistic counters ---------- */
    function initCounters() {
        const values = document.querySelectorAll('.stat-value');
        if (!values.length || prefersReducedMotion() || !('requestAnimationFrame' in window)) return;

        const pattern = /^(\D*?)(-?[\d,]+(?:\.\d+)?)(\D*)$/;

        const animate = function (el) {
            if (el.dataset.counted === 'true') return;
            const original = el.textContent.trim();
            const match = original.match(pattern);
            if (!match) return;

            const prefix = match[1];
            const suffix = match[3];
            const numeric = Number(match[2].replace(/,/g, ''));
            if (!Number.isFinite(numeric)) return;
            el.dataset.counted = 'true';

            const decimals = (match[2].split('.')[1] || '').length;
            const formatter = new Intl.NumberFormat('en-IN', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
            const format = function (value) {
                return prefix + formatter.format(value) + suffix;
            };

            const duration = 680;
            const start = performance.now();

            const frame = function (now) {
                const progress = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = format(numeric * eased);
                if (progress < 1) {
                    requestAnimationFrame(frame);
                } else {
                    el.textContent = original;
                }
            };
            requestAnimationFrame(frame);
        };

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    observer.unobserve(entry.target);
                    animate(entry.target);
                });
            }, { threshold: 0.35 });
            values.forEach(function (el) { observer.observe(el); });
        } else {
            values.forEach(animate);
        }
    }

    /* ---------- internal page transition ---------- */
    function initPageTransitions() {
        if (prefersReducedMotion()) return;
        const body = document.body;

        document.addEventListener('click', function (event) {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const link = event.target.closest ? event.target.closest('a[href]') : null;
            if (!link) return;
            if (link.target && link.target !== '_self') return;
            if (link.hasAttribute('download') || link.dataset.noTransition !== undefined) return;
            if (link.getAttribute('aria-disabled') === 'true') return;

            let url;
            try {
                url = new URL(link.href, window.location.href);
            } catch (error) {
                return;
            }
            if (url.origin !== window.location.origin) return;
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

            const sameView = url.pathname === window.location.pathname && url.search === window.location.search;
            if (sameView) return;

            if (body.classList.contains('is-leaving')) {
                event.preventDefault();
                return;
            }

            body.classList.add('is-leaving');
            // Restore the page if navigation is blocked before it completes.
            window.setTimeout(function () {
                body.classList.remove('is-leaving');
            }, 900);
        });

        window.addEventListener('pageshow', function () {
            body.classList.remove('is-leaving');
        });
    }

    /* ---------- submit button loading state ---------- */
    function initSubmitStates() {
        document.addEventListener('submit', function (event) {
            if (event.defaultPrevented) return;
            const form = event.target;
            if (!form || form.tagName !== 'FORM') return;

            const submitter = event.submitter || form.querySelector('button[type="submit"], input[type="submit"]');
            if (!submitter) return;

            window.setTimeout(function () {
                submitter.classList.add('is-loading');
                submitter.setAttribute('aria-busy', 'true');
                if ('disabled' in submitter) submitter.disabled = true;
            }, 20);
        });
    }

    /* ---------- chart stagger ---------- */
    function initChartMotion() {
        document.querySelectorAll('.day-chart').forEach(function (chart) {
            Array.prototype.forEach.call(chart.children, function (child, index) {
                child.style.setProperty('--i', index);
            });
        });
    }

    ready(function () {
        initSidebar();
        initMonthPickers();
        initConfirm();
        initToasts();
        initExpenseRows();
        initPasswordToggles();
        initRegistration();
        initCounters();
        initPageTransitions();
        initSubmitStates();
        initChartMotion();
    });
})();
