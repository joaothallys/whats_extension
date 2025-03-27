/*
This is a content script responsible for some UI.
*/

if (chrome != undefined) {
    var browser = chrome;
}

initialize();

var isInterceptionWorking = false;
var isUIClassesWorking = true;
var deletedMessagesDB = null;
var pseudoMsgsIDs = new Set();

function initialize() {
    browser.runtime.sendMessage({ name: "getOptions" }, (options) => {
        document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify(options) }));
        browser.runtime.sendMessage({ name: "setOptions", ...options });
    });

    const appElem = document.body;
    if (appElem) {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                handleAddedNodes(mutation.addedNodes);
                handleRemovedNodes(mutation.removedNodes);
            }
        });
        observer.observe(appElem, { childList: true, subtree: true });
    }

    setupMessageSendInterceptor();
    setTimeout(setupAttendantNameUI, 500); // Adicionado atraso para garantir que o DOM esteja carregado
}

function setupMessageSendInterceptor() {
    const inputObserver = new MutationObserver(() => {
        const messageInput = document.querySelector('span.selectable-text.copyable-text[data-lexical-text="true"]');
        const sendButton = document.querySelector('button[aria-label="Enviar"]') || document.querySelector('[data-testid="compose-btn-send"]');

        if (!messageInput) {
            console.log("Campo de entrada de mensagem não encontrado.");
            return;
        }

        if (!sendButton) {
            console.log("Botão de envio não encontrado.");
        }

        // Função para adicionar o nome do atendente
        const addAttendantName = () => {
            const attendantName = localStorage.getItem('attendantName') || '';
            if (!attendantName) {
                console.log("Nenhum nome de atendente configurado.");
                return;
            }

            const currentText = messageInput.innerText.trim();
            console.log("Texto atual da mensagem antes de adicionar o nome do atendente:", currentText);

            // Se a mensagem não começar com o nome do atendente, adiciona
            if (currentText && !currentText.startsWith(`*${attendantName}*`)) {
                messageInput.innerText = `*${attendantName}*\n${currentText}`;
                console.log("Texto após adicionar o nome do atendente:", messageInput.innerText);

                // Dispara um evento de input para atualizar o campo
                const inputEvent = new Event('input', { bubbles: true });
                messageInput.dispatchEvent(inputEvent);

                Swal.fire({
                    title: 'Sucesso!',
                    text: `Nome "${attendantName}" adicionado à mensagem.`,
                    icon: 'success',
                    timer: 1000,
                    showConfirmButton: false
                });
                console.log("Nome do atendente inserido com sucesso.");
            } else {
                console.log("O texto já contém o nome do atendente ou está vazio.");
            }
        };

        // Captura a tecla Enter para envio
        messageInput.onkeydown = (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Impede o envio imediato

                console.log("Tecla Enter pressionada.");
                console.log("Texto da mensagem antes de enviar:", messageInput.innerText);

                addAttendantName();
                console.log("Nome do atendente adicionado, simulando envio da mensagem.");

                // Simula o evento de envio da mensagem
                const sendEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                messageInput.dispatchEvent(sendEvent);
            }
        };

        // Intercepta o clique no botão de envio
        if (sendButton && !sendButton.dataset.listenerAdded) {
            sendButton.addEventListener('click', (event) => {
                event.preventDefault(); // Impede o envio imediato
                console.log("Botão de envio clicado.");

                addAttendantName();
                console.log("Nome do atendente adicionado, simulando envio da mensagem.");
            });
            sendButton.dataset.listenerAdded = 'true';
        }
    });

    // Observar a adição de novos nós para detectar o campo de entrada de mensagem
    inputObserver.observe(document.body, { childList: true, subtree: true });
}




function setupAttendantNameUI() {
    const observer = new MutationObserver((mutations) => {
        const attendantNameInput = document.getElementById('attendant-name-input');
        if (attendantNameInput) {
            const savedName = localStorage.getItem('attendantName') || '';
            attendantNameInput.value = savedName;
            console.log("Nome carregado do localStorage:", savedName);

            const saveButton = document.getElementById('save-attendant-name-button');
            if (saveButton) {
                saveButton.addEventListener('click', () => {
                    const name = attendantNameInput.value.trim();
                    if (name) {
                        localStorage.setItem('attendantName', name);
                        console.log("Nome salvo no localStorage:", name);
                        Swal.fire({
                            title: 'Salvo!',
                            text: `O nome "${name}" foi salvo com sucesso.`,
                            icon: 'success',
                            confirmButtonText: 'OK',
                            timer: 1500,
                            showConfirmButton: false
                        });
                    } else {
                        console.log("Erro: Nome inválido ou vazio.");
                        Swal.fire({
                            title: 'Erro!',
                            text: 'Por favor, insira um nome válido.',
                            icon: 'error',
                            confirmButtonText: 'OK'
                        });
                    }
                });
            }
            observer.disconnect(); // Desconecta o observador depois que o campo for encontrado
        }
    });

    // Observar o DOM para ver quando o campo de entrada for inserido
    observer.observe(document.body, { childList: true, subtree: true });
}



function handleAddedNodes(addedNodes) {
    for (const addedNode of addedNodes) {
        if (addedNode.classList == undefined) continue;

        if (addedNode.getElementsByClassName("two").length > 0) {
            addIconIfNeeded();
            setTimeout(function () { onMainUIReady(); }, 100);
        } else if (addedNode.nodeName.toLowerCase() == "div" && addedNode.classList.contains(UIClassNames.OUTER_DROPDOWN_CLASS)) {
            setTimeout(function () {
                document.dispatchEvent(new CustomEvent('onDropdownOpened', {}));
            }, 200);
        }

        const msgNodes = addedNode.querySelectorAll("div.message-in, div.message-out");
        for (let i = 0; i < msgNodes.length; i++) {
            const currentNode = msgNodes[i];
            onNewMessageNodeAdded(currentNode);
        }
    }
}

function handleRemovedNodes(removedNodes) {
    for (const removedNode of removedNodes) {
        if (removedNode.classList == undefined) continue;
        if (removedNode.classList.contains("two")) {
            const menuItem = document.getElementsByClassName("menu-item-incognito")[0];
            const dropItem = document.getElementsByClassName("drop")[0];
            if (menuItem != undefined) menuItem.remove();
            if (dropItem != undefined) dropItem.remove();
        }
    }
}

function onMainUIReady() {
    document.dispatchEvent(new CustomEvent('onMainUIReady', {}));

    setTimeout(checkInterception, 1000);
    setTimeout(addIconIfNeeded, 1000);
}

async function addIconIfNeeded() {
    if (document.getElementsByClassName("menu-item-incognito").length > 0) return;

    const firstMenuItem = document.getElementsByClassName(UIClassNames.MENU_ITEM_CLASS)[0];
    if (firstMenuItem != undefined) {
        const menuItemElem = await generateSVGElement(chrome.runtime.getURL("images/incognito_gray_24_hollow_9.svg"), "_26lC3", "Incognito Options", 24, "button");
        menuItemElem.setAttribute("class", UIClassNames.MENU_ITEM_CLASS + " menu-item-incognito");

        firstMenuItem.parentElement.insertBefore(menuItemElem, firstMenuItem);

        browser.runtime.sendMessage({ name: "getOptions" }, function (options) {
            document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify(options) }));

            const dropContent = generateDropContent(options);
            const drop = new Drop({
                target: menuItemElem,
                content: dropContent,
                position: "bottom left",
                classes: "drop-theme-incognito",
                openOn: "click",
                tetherOptions: {
                    offset: "-4px -4px 0 0"
                },
            });
            const originalCloseFunction = drop.close;
            drop.close = function () {
                document.dispatchEvent(new CustomEvent('onIncognitoOptionsClosed', { detail: null }));
                setTimeout(function () { originalCloseFunction.apply(drop, arguments); }, 100);
            };
            drop.on("open", function () {
                if (!checkInterception()) return;
                const pressedMenuItemClass = UIClassNames.MENU_ITEM_CLASS + " " + UIClassNames.MENU_ITEM_HIGHLIGHTED_CLASS + " active menu-item-incognito";
                document.getElementsByClassName("menu-item-incognito")[0].setAttribute("class", pressedMenuItemClass);

                document.getElementById("incognito-option-read-confirmations").addEventListener("click", onReadConfirmaionsTick);
                document.getElementById("incognito-option-online-status").addEventListener("click", onOnlineUpdatesTick);
                document.getElementById("incognito-option-typing-status").addEventListener("click", onTypingUpdatesTick);
                document.getElementById("incognito-option-save-deleted-msgs").addEventListener("click", onSaveDeletedMsgsTick);
                document.getElementById("incognito-option-show-device-type").addEventListener("click", onShowDeviceTypesTick);
                document.getElementById("incognito-option-auto-receipt").addEventListener("click", onAutoReceiptsTick);
                document.getElementById("incognito-option-status-downloading").addEventListener("click", onStatusDownloadingTick);
                for (const nextButton of document.getElementsByClassName('incognito-next-button')) {
                    nextButton.addEventListener("click", onNextButtonClicked);
                }
                for (const nextButton of document.getElementsByClassName('incognito-back-button')) {
                    nextButton.addEventListener("click", onBackButtonClicked);
                }

                document.dispatchEvent(new CustomEvent('onIncognitoOptionsOpened', { detail: null }));
            });
            drop.on("close", function () {
                document.getElementsByClassName("menu-item-incognito")[0].setAttribute("class", UIClassNames.MENU_ITEM_CLASS + " menu-item-incognito");

                document.getElementById("incognito-option-read-confirmations").removeEventListener("click", onReadConfirmaionsTick);
                document.getElementById("incognito-option-online-status").removeEventListener("click", onOnlineUpdatesTick);
                document.getElementById("incognito-option-typing-status").removeEventListener("click", onTypingUpdatesTick);

                for (const nextButton of document.getElementsByClassName('incognito-next-button')) {
                    nextButton.removeEventListener("click", onNextButtonClicked);
                }
                for (const nextButton of document.getElementsByClassName('incognito-back-button')) {
                    nextButton.removeEventListener("click", onBackButtonClicked);
                }
            });
        });
    } else if (isUIClassesWorking) {
        isUIClassesWorking = false;
        Swal.fire({
            title: "WAIncognito is temporarily broken",
            html: 'It seems that due to a recent WhatsApp Web update some graphical elements of the extnesion will not appear. \
                        <br><Br> Please be patient for a few days until a newer compatible version will be released.',
            icon: "warning",
            width: 600,
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "Got it",
        });
    }
}

function generateDropContent(options) {
    const onlineStatusTitle = "Hide \"online\" status";
    const onlineStatusCaption = "Stops sending presence updates. Will prevent you from seeing others' online status.";

    const typingStatusTitle = "Hide \"typing...\" status";
    const typingStatusCaption = "Stops sending typing updates.";

    const readConfirmationsTitle = "Don't send read confirmations";
    const readConfirmationsCaption = "Blocked messages will be marked with a button.";
    const readConfirmationsNote = "Also works for stories and audio messages.";

    const deletedMessagesTitle = "Restore deleted messages";
    const deletedMessagesCaption = "Marks deleted messages in red";

    const showDeviceTypeTitle = "Show device of messages";
    const showDeviceTypeCaption = "Shows whether each new message was sent from a phone or a computer";

    const autoReceiptTitle = "Auto-Send receipts on reply";
    const autoReceiptCaption = "Automatically mark messages as read when replying in a chat";

    const allowStatusDownloadTitle = "Allow status downloading";
    const allowStatusDownloadCaption = "Adds a button to download statuses";

    const readConfirmationCheckbox = (options.readConfirmationsHook ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const onlineUpdatesCheckbox = (options.onlineUpdatesHook ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const typingUpdatesCheckbox = (options.typingUpdatesHook ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const saveDeletedMessagesCheckbox = (options.saveDeletedMsgs ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const showDeviceTypeCheckbox = (options.showDeviceTypes ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const autoReceiptCheckbox = (options.autoReceiptOnReplay ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");
    const allowStatusDownloadCheckbox = (options.allowStatusDownload ? "checked incognito-checked'> \
            <div class='checkmark incognito-mark incognito-marked'> </div>" :
        "unchecked " + "'> <div class='checkmark incognito-mark" + "'> </div>");

    const dropContent = ` \
            <div class='incognito-options-container' dir='ltr'>
                <div class='incognito-options-title'>Incognito options</div>
    
                <div class='incognito-options-navigator'>
                    <div class='incognito-options-view-container' style='transform: translate(0%, 0%);' id='incognito-options-view1'>
    
                        <!---- First Page ---!>
                                                                                
                        <div id='incognito-option-read-confirmations' style='cursor: pointer !important; margin-bottom: 0px' class='incognito-options-item'> 
                            <div class='checkbox-container-incognito' style=''>
                                <div class='checkbox checkbox-incognito ${readConfirmationCheckbox}
                                </div>
                            </div>
                            ${readConfirmationsTitle}
                            <div class='incognito-options-description'>${readConfirmationsCaption}</div>
                            <br>
                            <div style='margin-left: 28px !important; margin-top: 0px; font-size: 12px; opacity: 0.8'>
                                ${readConfirmationsNote}
                            </div> 
                        </div> 
                                
                        <div id='incognito-option-online-status' class='incognito-options-item' style='cursor: pointer;'>
                            <div class='checkbox-container-incognito' style=''>
                                <div class='checkbox checkbox checkbox-incognito ${onlineUpdatesCheckbox}
                                </div>
                            </div>
                            ${onlineStatusTitle}
                            <div class='incognito-options-description'>${onlineStatusCaption}</div>
                        </div>
                        <div id='incognito-option-typing-status' class='incognito-options-item' style='cursor: pointer;'>
                            <div class='checkbox-container-incognito' style=''>
                                <div class='checkbox checkbox checkbox-incognito ${typingUpdatesCheckbox}
                                </div>
                            </div>
                            ${typingStatusTitle}
                            <div class='incognito-options-description'>${typingStatusCaption}</div>
                        </div>

                        <!---- New Section for Attendant Name ---!>
                        <div class='incognito-options-item' style='margin-top: 20px;'>
                            <label for='attendant-name-input' style='font-weight: bold;'>Attendant Name:</label>
                            <input type='text' id='attendant-name-input' placeholder='Enter your name' style='width: 100%; padding: 5px; margin-top: 5px;' />
                            <button id='save-attendant-name-button' style='margin-top: 10px; padding: 5px 10px;'>Save</button>
                        </div>

                        <button class='incognito-next-button'>Next &gt</button>
                    </div>
    
                    <div class='incognito-options-view-container'  style='transform: translate(100%, 0%);' id='incognito-options-view2'>
    
                        <!---- Second Page ---!>
                        
                        <div class='incognito-options-view' id='incognito-options-view-internal2'>
                            <div id='incognito-option-save-deleted-msgs' class='incognito-options-item' style='cursor: pointer;'>
                                <div class='checkbox-container-incognito' style=''>
                                    <div class='checkbox checkbox checkbox-incognito ${saveDeletedMessagesCheckbox}
                                    </div>
                                </div>
                                ${deletedMessagesTitle}
                                <div class='incognito-options-description'>${deletedMessagesCaption}</div>
                            </div>
                            <div id='incognito-option-show-device-type' class='incognito-options-item' style='cursor: pointer;'>
                                <div class='checkbox-container-incognito' style=''>
                                    <div class='checkbox checkbox checkbox-incognito ${showDeviceTypeCheckbox}
                                    </div>
                                </div>
                                ${showDeviceTypeTitle}
                                <div class='incognito-options-description'>${showDeviceTypeCaption}</div>
                            </div>
                            <div id='incognito-option-auto-receipt' class='incognito-options-item' style='cursor: pointer;'>
                                <div class='checkbox-container-incognito' style=''>
                                    <div class='checkbox checkbox checkbox-incognito ${autoReceiptCheckbox}
                                    </div>
                                </div>
                                ${autoReceiptTitle}
                                <div class='incognito-options-description'>${autoReceiptCaption}</div>
                            </div>
                            <br>
                            <button class='incognito-next-button'>Next &gt</button>
                            <button class='incognito-back-button'>&lt Back</button>
                        </div>
                    </div>
    
                    <div class='incognito-options-view-container' style='transform: translate(200%, 0%);' id='incognito-options-view3'>
    
                        <!---- Third Page ---!>
                        <div class='incognito-options-view' id='incognito-options-view-internal3'>
                            <div id='incognito-option-status-downloading' class='incognito-options-item' style='cursor: pointer;'>
                                <div class='checkbox-container-incognito' style=''>
                                    <div class='checkbox checkbox checkbox-incognito ${allowStatusDownloadCheckbox}
                                    </div>
                                </div>
                                ${allowStatusDownloadTitle}
                                <div class='incognito-options-description'>${allowStatusDownloadCaption}</div>
                            </div>
                            <div class='incognito-options-item' style='cursor: pointer;'>
                                More options coming soon!
                            </div>
                            <button class='incognito-back-button'>&lt Back</button>
                        </div>
                    </div>
    
                    
                </div>
                
            </div>`;

    return dropContent;
}

document.addEventListener('onMarkAsReadClick', function (e) {
    const data = JSON.parse(e.detail);
    browser.runtime.sendMessage({ name: "getOptions" }, function (options) {
        if (options.readConfirmationsHook) {
            if (options.showReadWarning) {
                Swal.fire({
                    title: "Mark as read?",
                    text: data.formattedName + " will be able to tell you read the last " +
                        (data.unreadCount > 1 ? data.unreadCount + " messages." : " message."),
                    input: 'checkbox',
                    inputValue: 0,
                    inputPlaceholder: "Don't show this warning again",
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonColor: "#DD6B55",
                    confirmButtonText: "Yes, send receipt",
                }).then(result => {
                    if (result.isConfirmed) {
                        document.dispatchEvent(new CustomEvent('sendReadConfirmation', { detail: JSON.stringify(data) }));

                        const shouldShowReadWarning = result.value == 0;
                        browser.runtime.sendMessage({ name: "setOptions", showReadWarning: shouldShowReadWarning });
                        document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ showReadWarning: shouldShowReadWarning }) }));
                    }
                });
            } else {
                document.dispatchEvent(new CustomEvent('sendReadConfirmation', { detail: JSON.stringify(data) }));
            }
        }
    });
});

document.addEventListener('onInterceptionWorking', function (e) {
    const data = JSON.parse(e.detail);
    isInterceptionWorking = data.isInterceptionWorking;

    const deletedDBOpenRequest = indexedDB.open("deletedMsgs", 1);
    deletedDBOpenRequest.onsuccess = () => {
        const deletedMsgsDB = deletedDBOpenRequest.result;
        const keys = deletedMsgsDB.transaction('msgs', "readonly").objectStore("msgs").getAll();
        keys.onsuccess = () => {
            keys.result.forEach((value) => {
                pseudoMsgsIDs.add(value.originalID);
            });
            document.addEventListener("pseudoMsgs", (e) => {
                pseudoMsgsIDs.add(e.detail);
            });
        };
        deletedMsgsDB.close();
    };
});

function getTheme() {
    if (localStorage["theme"] != "null" && localStorage["theme"] != undefined)
        return localStorage["theme"];
    else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ||
            document.getElementsByClassName("web")[0].classList.contains("dark"))
            return "\"dark\"";
        else
            return "\"light\"";
    }
}

function onReadConfirmaionsTick() {
    let readConfirmationsHook = false;
    const checkbox = document.querySelector("#incognito-option-read-confirmations .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;

    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        readConfirmationsHook = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        readConfirmationsHook = false;
        const redChats = document.getElementsByClassName("icon-meta unread-count incognito");
        for (let i = 0; i < redChats.length; i++) {
            redChats[i].className = 'icon-meta unread-count';
        }
    }
    browser.runtime.sendMessage({ name: "setOptions", readConfirmationsHook: readConfirmationsHook });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ readConfirmationsHook: readConfirmationsHook }) }));
}

function onOnlineUpdatesTick() {
    let onlineUpdatesHook = false;
    const checkbox = document.querySelector("#incognito-option-online-status .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;
    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        onlineUpdatesHook = true;
        document.dispatchEvent(new CustomEvent('onPresenceOptionTicked'));
    } else {
        untickCheckbox(checkbox, checkmark);
        onlineUpdatesHook = false;
        document.dispatchEvent(new CustomEvent('onPresenceOptionUnticked'));
    }
    browser.runtime.sendMessage({ name: "setOptions", onlineUpdatesHook: onlineUpdatesHook });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ onlineUpdatesHook: onlineUpdatesHook }) }));
}

function onTypingUpdatesTick() {
    let typingUpdatesHook = false;
    const checkbox = document.querySelector("#incognito-option-typing-status .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;
    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        typingUpdatesHook = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        typingUpdatesHook = false;
    }
    browser.runtime.sendMessage({ name: "setOptions", typingUpdatesHook: typingUpdatesHook });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ typingUpdatesHook: typingUpdatesHook }) }));
}

function onSaveDeletedMsgsTick() {
    let saveDeletedMsgsHook = false;
    const checkbox = document.querySelector("#incognito-option-save-deleted-msgs .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;
    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        saveDeletedMsgsHook = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        saveDeletedMsgsHook = false;
    }
    browser.runtime.sendMessage({ name: "setOptions", saveDeletedMsgs: saveDeletedMsgsHook });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ saveDeletedMsgs: saveDeletedMsgsHook }) }));
}

function onShowDeviceTypesTick() {
    let showDeviceTypes = false;
    const checkbox = document.querySelector("#incognito-option-show-device-type .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;

    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        showDeviceTypes = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        showDeviceTypes = false;
    }
    browser.runtime.sendMessage({ name: "setOptions", showDeviceTypes: showDeviceTypes });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ showDeviceTypes: showDeviceTypes }) }));
}

function onAutoReceiptsTick() {
    let autoReceipts = false;
    const checkbox = document.querySelector("#incognito-option-auto-receipt .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;

    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        autoReceipts = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        autoReceipts = false;
    }
    browser.runtime.sendMessage({ name: "setOptions", autoReceiptOnReplay: autoReceipts });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ autoReceiptOnReplay: autoReceipts }) }));
}

function onStatusDownloadingTick() {
    let allowStatusDownload = false;
    const checkbox = document.querySelector("#incognito-option-status-downloading .checkbox-incognito");
    const checkmark = checkbox.firstElementChild;

    if (checkbox.getAttribute("class").indexOf("unchecked") > -1) {
        tickCheckbox(checkbox, checkmark);
        allowStatusDownload = true;
    } else {
        untickCheckbox(checkbox, checkmark);
        allowStatusDownload = false;
    }
    browser.runtime.sendMessage({ name: "setOptions", allowStatusDownload: allowStatusDownload });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ allowStatusDownload: allowStatusDownload }) }));
}

function onNextButtonClicked() {
    const views = Array.from(document.getElementsByClassName("incognito-options-view-container"));

    requestAnimationFrame(() => {
        for (const view of views) {
            const prevViewX = getTransformXOfView(view);
            view.style.transform = "translate(" + (prevViewX - 100) + "%, 0%)";
        }
    });
}

function onBackButtonClicked() {
    const views = Array.from(document.getElementsByClassName("incognito-options-view-container"));

    requestAnimationFrame(() => {
        for (const view of views) {
            const prevViewX = getTransformXOfView(view);
            view.style.transform = "translate(" + (prevViewX + 100) + "%, 0%)";
        }
    });
}

function getTransformXOfView(view) {
    if (view.style.transform.includes("translate"))
        return parseInt(view.style.transform.match(/-?[\d\.]+/g)[0]);
    else
        return 0;
}

function onSafetyDelayChanged(event) {
    if (isSafetyDelayValid(event.srcElement.value)) {
        const delay = parseInt(event.srcElement.value);
        document.getElementById("incognito-option-safety-delay").disabled = false;
        browser.runtime.sendMessage({ name: "setOptions", safetyDelay: delay });
        document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ safetyDelay: delay }) }));
    }
}

function onSafetyDelayDisabled() {
    document.getElementById("incognito-option-safety-delay").disabled = true;
    document.getElementById("incognito-radio-enable-safety-delay").checked = false;
    browser.runtime.sendMessage({ name: "setOptions", safetyDelay: 0 });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ safetyDelay: 0 }) }));
}

function onSafetyDelayEnabled() {
    let delay = parseInt(document.getElementById("incognito-option-safety-delay").value);
    if (isNaN(delay)) delay = parseInt(document.getElementById("incognito-option-safety-delay").placeholder);
    document.getElementById("incognito-option-safety-delay").disabled = false;
    document.getElementById("incognito-radio-disable-safety-delay").checked = false;
    browser.runtime.sendMessage({ name: "setOptions", safetyDelay: delay });
    document.dispatchEvent(new CustomEvent('onOptionsUpdate', { detail: JSON.stringify({ safetyDelay: delay }) }));
}

async function generateSVGElement(svgImagePath, clazz = "", title = "", size = 24, role = "") {
    const response = await fetch(svgImagePath);
    const text = await response.text();
    const viewBoxText = text.split('viewBox="')[1].split('"')[0];
    const viewboxSize = parseInt(text.split('viewBox="')[1].split(' ')[2]);

    const menuItemElem = document.createElement("div");

    menuItemElem.innerHTML = `<div aria-disabled="false" role="${role}" tabindex="0" class="${clazz}" title="${title}" \
                                aria-label="${title}"><span data-testid="menu" data-icon="menu" class=""><svg viewBox="${viewBoxText}" \
                                width="${size}" height="${size}" class=""><path fill="currentColor" d=""></path></svg></span></div><span></span>`;
    const path = menuItemElem.getElementsByTagName("path")[0];
    const svg = menuItemElem.getElementsByTagName("svg")[0];

    const dom = new DOMParser().parseFromString(text, 'text/html');
    const svgHtml = dom.getElementsByTagName("svg")[0].innerHTML;
    svg.innerHTML = svgHtml;

    return menuItemElem;
}

function onNewMessageNodeAdded(messageNode) {
    const data_id = messageNode.getAttribute("data-id");
    if (!data_id) data_id = messageNode.parentElement.getAttribute("data-id");
    if (data_id == null)
        debugger;
    const msgID = data_id.split("_")[2];

    restoreViewOnceMessageIfNeeded(messageNode, msgID);
    restoreDeletedMessageIfNeeded(messageNode, msgID);
    markMessageNodeDeviceIfPossible(messageNode, msgID);
}

function restoreViewOnceMessageIfNeeded(messageNode, msgID) {
    const viewOnceDBOpenRequest = window.indexedDB.open("viewOnce", 2);
    viewOnceDBOpenRequest.onupgradeneeded = function (event) {
        const db = event.target.result;
        const store = db.createObjectStore('msgs', { keyPath: 'id' });
        console.log('WhatsIncognito: Created viewOnce database.');
        store.createIndex("id_index", "id");
    };

    viewOnceDBOpenRequest.onsuccess = function () {
        const viewOnceDB = viewOnceDBOpenRequest.result;
        const keys = viewOnceDB.transaction('msgs', "readonly").objectStore("msgs").getAll();
        keys.onsuccess = () => {
            keys.result.forEach((value) => {
                if (value.id == msgID) {
                    let viewOnceExplanation = null;
                    const aElements = messageNode.getElementsByTagName("a");
                    for (let i = 0; i < aElements.length; i++) {
                        if (aElements[i].innerHTML.includes("Learn more")) {
                            viewOnceExplanation = aElements[i].parentElement;
                        }
                    }
                    viewOnceExplanation.innerHTML = "";
                    if (value.dataURI.startsWith("data:image")) {
                        const img = document.createElement("img");
                        img.src = value.dataURI;
                        img.style.cssText = "width: 100%;";
                        viewOnceExplanation.appendChild(img);
                    } else if (value.dataURI.startsWith("data:video")) {
                        const video = document.createElement("video");
                        video.controls = true;
                        video.src = value.dataURI;
                        viewOnceExplanation.appendChild(video);
                    } else if (value.dataURI.startsWith("data:audio")) {
                        const audio = document.createElement("audio");
                        audio.controls = true;
                        audio.src = value.dataURI;
                        viewOnceExplanation.appendChild(audio);
                    }

                    if (value.caption != null) {
                        const textSpan = document.createElement("span");
                        const textSpanStyle = "font-style: normal; color: rgba(241, 241, 242, 0.95); margin-top: 10px; margin-bottom: 10px;";
                        textSpan.style.cssText = textSpanStyle;
                        textSpan.className = "copyable-text selectable-text";
                        textSpan.textContent = value.caption;
                        viewOnceExplanation.appendChild(textSpan);
                    }

                    const learnMore = document.createElement("a");
                    learnMore.className = "incognito-view-once-learn-more";
                    learnMore.href = "#";
                    learnMore.innerHTML = "Sent as view once: Learn more";
                    learnMore.addEventListener("click", function () {
                        Swal.fire({
                            title: "View-once message",
                            html: 'This message was sent as a view-once. \
                                <br><br> Note that the recipient\'s device will show this as unopened \
                                <br><br> You can view this message multiple times and screenshot, and the recipient will not be notified. ',
                            icon: "info",
                            width: 600,
                            confirmButtonColor: "#000",
                            confirmButtonText: "Got it",
                        });
                    });
                    viewOnceExplanation.appendChild(learnMore);
                }
            });
        };
    };
}

function restoreDeletedMessageIfNeeded(messageNode, msgID) {
    document.dispatchEvent(new CustomEvent("getDeletedMessageByID", { detail: JSON.stringify({ messageID: msgID }) }));
    document.addEventListener("onDeletedMessageReceived", function (e) {
        const data = JSON.parse(e.detail);
        const messageID = data.messageID;
        const messageData = data.messageData;

        if (messageID != msgID) return;

        const span = document.createElement("span");
        const textSpan = document.createElement("span");
        span.className = UIClassNames.DELETED_MESSAGE_SPAN;

        const didFindInDeletedMessagesDB = messageData != undefined;
        const shouldTryToSyntehesizeMessage = messageNode.textContent.includes("message was deleted");

        if (!didFindInDeletedMessagesDB && !shouldTryToSyntehesizeMessage) {
            return;
        }

        if (didFindInDeletedMessagesDB) {
            messageNode.setAttribute("deleted-message", "true");

            if (!shouldTryToSyntehesizeMessage) {
                return;
            }
        }

        const messageSubElement = messageNode.getElementsByClassName(UIClassNames.CHAT_MESSAGE_INNER_TEXT_DIV)[0];
        if (!messageSubElement) return;

        if (!didFindInDeletedMessagesDB && shouldTryToSyntehesizeMessage) {
            messageSubElement.textContent = "";
            textSpan.textContent = "Failed to restore message";
            messageSubElement.appendChild(textSpan);
            messageSubElement.appendChild(span);
            messageNode.setAttribute("deleted-message", "true");

            return;
        }

        tryToSynthesizeMessage(messageSubElement, messageData);
    });
}

function tryToSynthesizeMessage(messageSubElement, messageData) {
    messageSubElement.textContent = "";

    const titleSpan = document.createElement("span");
    const textSpan = document.createElement("span");

    const textSpanStyle = "font-style: normal; color: rgba(241, 241, 242, 0.95)";
    const titleSpanStyle = "font-style: normal; color: rgb(128, 128, 128)";
    textSpan.style.cssText = textSpanStyle;
    textSpan.className = "copyable-text selectable-text";

    titleSpan.style.cssText = titleSpanStyle;
    if (messageData.isMedia) {
        titleSpan.textContent = "Restored media: \n";
        messageSubElement.appendChild(titleSpan);

        if (messageData.mediaText) textSpan.textContent = "\n" + messageData.mediaText;
        if (messageData.type === "image") {
            const imgTag = document.createElement("img");
            imgTag.style.cssText = "width: 100%;";
            imgTag.src = "data:" + messageData.mimetype + ";base64," + messageData.body;
            messageSubElement.appendChild(imgTag);
        } else if (messageData.type === "sticker") {
            const imgTag = document.createElement("img");
            imgTag.className = UIClassNames.STICKER_MESSAGE_TAG;
            imgTag.src = "data:" + messageData.mimetype + ";base64," + messageData.body;
            messageSubElement.appendChild(imgTag);
        } else if (messageData.type === "video") {
            const vidTag = document.createElement("video");
            vidTag.controls = true;
            vidTag.style.cssText = "width: 100%;";
            const sourceTag = document.createElement("source");
            sourceTag.type = messageData.mimetype;
            sourceTag.src = "data:" + messageData.mimetype + ";base64," + messageData.body;
            vidTag.appendChild(sourceTag);
            messageSubElement.appendChild(vidTag);
        } else if (messageData.type === "document") {
            const aTag = document.createElement("a");
            aTag.download = messageData.fileName;
            aTag.href = "data:" + messageData.mimetype + ";base64," + messageData.body;
            aTag.textContent = "Download \"" + messageData.fileName + "\"";
            messageSubElement.appendChild(aTag);
        } else if (messageData.type === "ptt") {
            const audioTag = document.createElement("audio");
            audioTag.controls = true;
            const sourceTag = document.createElement("source");
            sourceTag.type = messageData.mimetype;
            sourceTag.src = "data:" + messageData.mimetype + ";base64," + messageData.body;
            audioTag.appendChild(sourceTag);
            messageSubElement.appendChild(audioTag);
        }
    } else {
        if (messageData.type === "vcard") {
            let vcardBody = messageData.body;
            vcardBody = vcardBody.split(":");
            const phone = vcardBody[vcardBody.length - 2].slice(0, -4);
            const aTagPhone = document.createElement("a");
            aTagPhone.href = "tel:" + phone;
            aTagPhone.textContent = phone;
            aTagPhone.target = "_blank";
            aTagPhone.rel = "noopener noreferrer";
            const name = vcardBody[4].split(";")[0].slice(0, -4);

            titleSpan.textContent = "Restored contact card: \r\n";
            textSpan.textContent = "Name: " + name + "\n" + "Contact No.: ";

            messageSubElement.appendChild(titleSpan);
            textSpan.appendChild(aTagPhone);

        } else if (messageData.type === "location") {
            titleSpan.textContent = "Restored location: \n";
            const imgTag = document.createElement("img");
            imgTag.style.cssText = "width: 100%;";
            imgTag.src = "data:" + messageData.mimetype + ";base64," + messageData.body;
            messageSubElement.appendChild(imgTag);

            const locationLink = document.createElement("a");
            locationLink.target = "_blank";
            locationLink.rel = "noopener noreferrer";
            locationLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(messageData.lat + " " + messageData.lng);
            locationLink.textContent = "Google Maps Link";
            messageSubElement.appendChild(locationLink);
        } else {
            titleSpan.textContent = "Restored message: \n";
            textSpan.textContent = messageData.body;
            messageSubElement.appendChild(titleSpan);
        }
    }

    messageSubElement.appendChild(textSpan);
}

function markMessageNodeDeviceIfPossible(messageNode, msgID) {
    const isOutgoingMessage = messageNode.className.includes("message-out");
    if (isOutgoingMessage) {
        return;
    }

    document.dispatchEvent(new CustomEvent("getDeviceTypeForMessage", { detail: JSON.stringify({ messageID: msgID }) }));
    document.addEventListener("onDeviceTypeReceived", async function (e) {
        const data = JSON.parse(e.detail);
        const messageID = data.messageID;

        const deviceType = data.deviceType;

        if (messageID != msgID) return;

        const possibleNodes = document.querySelectorAll('[data-id*="' + messageID + '"]');
        if (possibleNodes.length > 0)
            messageNode = possibleNodes[0].childNodes[0];

        if (messageNode.getElementsByClassName("device-type-image").length > 0) return;

        let imageURL = "";
        if (deviceType == "computer")
            imageURL = chrome.runtime.getURL("images/computer.svg");
        else if (deviceType == "phone")
            imageURL = chrome.runtime.getURL("images/phone.svg");
        else
            return;

        const imageElement = await generateSVGElement(imageURL, "", "This message was sent from a " + deviceType, 19);
        imageElement.className = "device-type-image";

        const topMessageNode = messageNode.parentNode.parentNode;
        if (topMessageNode.innerHTML.includes("chat-profile-picture") || messageNode.innerHTML.includes("Open chat details")) {
            imageElement.className += " below-profile-picture";
        }

        messageNode.insertBefore(imageElement, messageNode.firstChild);
    });
}

function tickCheckbox(checkbox, checkmark) {
    const checkboxClass = checkbox.getAttribute("class");
    checkbox.setAttribute("class", checkboxClass.replace("unchecked", "checked") + " incognito-checked");
    checkmark.classList.add("incognito-marked");
}

function untickCheckbox(checkbox, checkmark) {
    const checkboxClass = checkbox.getAttribute("class");
    const chekmarkClass = checkmark.getAttribute("class");
    checkbox.setAttribute("class", checkboxClass.replace("checked", "unchecked").split("incognito-checked").join(" "));
    checkmark.setAttribute("class", chekmarkClass.replace("incognito-marked", ""));
}

function isSafetyDelayValid(string) {
    const number = Math.floor(Number(string));
    return (String(number) === string && number >= 1 && number <= 30) || string == "";
}

function checkInterception() {
    if (!isInterceptionWorking) {
        Swal.fire({
            title: "Oops...",
            html: "WhatsApp Web Incognito has detected that interception is not working. \
                       Please try refreshing this page, or, if the problem presists, writing back to the developer.",
            icon: "error",
            width: 600,
            confirmButtonColor: "#DD6B55",
            confirmButtonText: "OK",
        });
        return false;
    }

    return true;
}

function isNumberKey(evt) {
    const charCode = (evt.which) ? evt.which : event.keyCode;
    if (charCode > 31 && (charCode < 48 || charCode > 57))
        return false;
    return true;
}