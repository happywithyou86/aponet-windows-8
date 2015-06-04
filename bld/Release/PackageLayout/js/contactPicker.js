
(function () {
    "use strict";

    var contactPickerURI = "/contactPicker.html";

    var contactPickerUI;
    var contacts;
    var contactListView;


    var page = WinJS.UI.Pages.define(contactPickerURI, {
        processed: function (element, uri) {
            var roamingSettings = Windows.Storage.ApplicationData.current.roamingSettings;
            var addressBook = roamingSettings.values["addressBook"];
            if (addressBook) {
                contacts = JSON.parse(addressBook);
            } else {
                contacts = [];
            }
        },

        ready: function (element, options) {
            // Process all data-win-res attributes
            WinJS.Resources.processAll();

            contactListView = document.getElementById("contactPickerListView").winControl;
            var list = new WinJS.Binding.List(contacts);
            contactListView.itemDataSource = list.dataSource;
            contactListView.addEventListener("iteminvoked", listItemInvoked);
            
            contactPickerUI = options.contactPickerUI;
            contactPickerUI.addEventListener("contactremoved", onContactRemoved, false);

            if (contacts.length === 0) {
                var noContacts = document.getElementById("noContacts");
                noContacts.style.display = 'inline';
            }
        },

        unload: function () {
            contactPickerUI.removeEventListener("contactremoved", onContactRemoved, false);
        }
    });

    function listItemInvoked(e) {
        e.detail.itemPromise.done(function (invokedItem) {
            {
                var apotheke = invokedItem.data;
                apotheke.id = "apo" + invokedItem.index;
                if (!apotheke.checked) {
                    addContact(apotheke);
                    apotheke.checked = true;
                } else {
                    removeContact(apotheke);
                    apotheke.checked = false;
                }
            }
        });
    }

    function addContact(apotheke) {
        var contact = new Windows.ApplicationModel.Contacts.Contact();
        // Set the name
        contact.name = apotheke.name;
        // Set the phone number
        appendPhoneNumber(contact.fields, apotheke.telephone, Windows.ApplicationModel.Contacts.ContactFieldCategory.work);
        // Set the address
        appendAddress(contact.fields, apotheke, Windows.ApplicationModel.Contacts.ContactFieldCategory.none);

        var imageURI = Windows.Foundation.Uri("ms-appx:///images/smalllogo.scale-140.png");
        var imageRef = Windows.Storage.Streams.RandomAccessStreamReference.createFromUri(imageURI);
        contact.thumbnail = imageRef;

        // Add the contact to the UI
        contactPickerUI.addContact(apotheke.id, contact);
    }

    function removeContact(apotheke) {
        // Check if the apotheke is actually added
        if (contactPickerUI.containsContact(apotheke.id)) {
            // Remove it from the list
            contactPickerUI.removeContact(apotheke.id);
        }
    }

    function onContactRemoved(e) {
        var index = 0;
        contacts.forEach(function (apotheke) {
            if (apotheke.id == e.id) {
                apotheke.checked = false;
                contactListView.selection.remove(index);
            }
            index++;
        });

        
    }

    function appendEmail(fields, email, category) {
        appendField(fields, email, Windows.ApplicationModel.Contacts.ContactFieldType.email, category);
    }

    function appendPhoneNumber(fields, phone, category) {
        appendField(fields, phone, Windows.ApplicationModel.Contacts.ContactFieldType.phoneNumber, category);
    }

    function appendAddress(fields, apotheke, category) {
        if (apotheke) {
            var address = apotheke.street + ", " + apotheke.zipcode + " " + apotheke.city;
            fields.append(new Windows.ApplicationModel.Contacts.ContactLocationField(
                           address, category, apotheke.street, apotheke.city, "", "", apotheke.zipcode));
        }
    }

    function appendField(fields, value, type, category) {
        // Adds a new field of the desired type, either email or phone number
        if (value) {
            fields.append(new Windows.ApplicationModel.Contacts.ContactField(value, type, category));
        }
    }   

})();
