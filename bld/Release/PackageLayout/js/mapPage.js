

(function () {
    "use strict";

    WinJS.Binding.optimizeBindingReferences = true;

    // constants
    var mapPageURI = "/mapPage.html";

    // Namespace Shortcuts
    var activation = Windows.ApplicationModel.Activation;

    // DOM Elements
    var apothekenListViewDiv;
    var apothekenDetailsDiv;
    var retrievingDataProgress;
    var cmdNotdienst;
    var cmdRegular;
    var cmdUseLocation;
    var locationErrorDiv;

    // Controls
    var appBar;
    var apothekenListView;

    // Map
    var map;
    var selctedApothekeInfobox = null;
    var mapPins = [];    

    var oldShareHandler;

    // Non-persistent state

    // The currently selected apotheke. May be null
    var selectedApotheke = null;
    // The index of the currently selected apotheke in the regularApotheken or notdienstApotheken 
    // array depending on notdienst
    var selectedApothekeIndex = -1;

    WinJS.UI.Pages.define(mapPageURI, {
        // This function is called whenever a user navigates to this page. It
        // populates the page elements with the app's data.
        ready: function (element, options) {
            // Process all data-win-res attributes
            WinJS.Resources.processAll(element);

            // App bar
            // -------
            appBar = document.getElementById("appBar").winControl;
            appBar.addEventListener("beforehide", appBarBeforeHide, false);
            cmdUseLocation = document.getElementById("cmdUseLocation");
            cmdUseLocation.addEventListener("click", cmdUseLocationClick, false);
            cmdNotdienst = document.getElementById("cmdNotdienst");
            cmdNotdienst.addEventListener("click", toggleNotdienst, false);
            cmdRegular = document.getElementById("cmdRegular");
            cmdRegular.addEventListener("click", toggleNotdienst, false);
            appBar.showCommands(document.getElementById("appBar").querySelectorAll('.mapContext'));

            // Map and zoom Controls
            // ---------------------
            var zoomInDiv = document.getElementById("zoomInDiv");
            zoomInDiv.addEventListener("click", zoomInClick);
            var zoomOutDiv = document.getElementById("zoomOutDiv");
            zoomOutDiv.addEventListener("click", zoomOutClick);

            // Apotheken list
            // --------------
            apothekenListViewDiv = document.getElementById("apothekenListView");
            // The control sets this to relative for some reason so we set it back to relative here
            apothekenListViewDiv.style.position = "absolute";
            // Get the actual control
            apothekenListView = apothekenListViewDiv.winControl;
            apothekenListView.addEventListener("iteminvoked", listItemInvoked);

            // Apotheken Details Flyout
            // ------------------------
            apothekenDetailsDiv = document.getElementById("apothekenDetails");
            apothekenDetailsDiv.style.display = "none";
            var closeDetailsButton = document.getElementById("closeDetailsButton");
            closeDetailsButton.addEventListener("click", hideDetailsPane, false);
            var drivingDirectionsButton = document.getElementById("drivingDirectionsButton");
            drivingDirectionsButton.addEventListener("click", drivingDirectionsClick, false);
            var addContactButton = document.getElementById("addContactButton");
            addContactButton.addEventListener("click", addContactClick, false);
            
            // Misc.
            locationErrorDiv = document.getElementById("locationErrorDiv");
            retrievingDataProgress = document.getElementById("retrievingDataProgress");

            // Restore state and initialize the map
            // ------------------------------------

            Microsoft.Maps.loadModule('Microsoft.Maps.BingTheme');
            Microsoft.Maps.loadModule('Microsoft.Maps.Map', { callback: initMap, culture: "de-de", homeRegion: "DE" });            
           
            function initMap() {
                // Initialize constatn after the module is loaded
                Application.BOUNDS_GERMANY = new Microsoft.Maps.LocationRect.fromCorners(new Microsoft.Maps.Location(47, 6), new Microsoft.Maps.Location(55, 15));


                
                var mapOptions =
                {
                    credentials: "Aq-XamJc2dELbm2ZaiAfYZ3Y-9iy5CMhl9CS27VZDmcZ6Y2DeMxMSLhhb2GQEo_1",
                    bounds: Application.BOUNDS_GERMANY,
                    theme: new Microsoft.Maps.Themes.BingTheme(),
                    showDashboard: false,   // Do not show any of bings own control overlays
                };

                map = new Microsoft.Maps.Map(document.getElementById("mapDiv"), mapOptions);
                // Create the seach manager
                Application.searchManager = new Microsoft.Maps.Search.SearchManager(map);
            }            

            // Handle options passed in
            // ---------------------------------------------

            // If we have come from the search result page get the data for the location the user
            // selected
            if (options && options.location) {
                updateData(options.location);
            } else
            // If we have restored state from disk ...
            if (Application.state.timestamp) {
                // populate the map with the restored state
                populateMap();
                // check the data is still up-to-date
                checkDataExpired();
            }
            // App started from scratch -> Start with the current location
            else {
                requestLocation();
            }

            document.addEventListener("visibilitychange", visibilityChanged, false);

            // Register handler for when the user picks a search suggestion
            Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onresultsuggestionchosen = searchSuggestionChosen;
            // Preserve the share handler wich reccomends the app
            oldShareHandler = Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView().ondatarequested;
            // Register our own handler for recommending the selected apotheke
            Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView().ondatarequested = onShareData;
        },

        unload: function () {
            // Unregister context sensitive event handlers of the app bar
            cmdUseLocation = document.getElementById("cmdUseLocation");
            cmdUseLocation.removeEventListener("click", cmdUseLocationClick);
            cmdNotdienst = document.getElementById("cmdNotdienst");
            cmdNotdienst.removeEventListener("click", toggleNotdienst);
            cmdRegular = document.getElementById("cmdRegular");
            cmdRegular.removeEventListener("click", toggleNotdienst);
            // Hide the context sensitive app bar commands
            appBar.hideCommands(document.getElementById("appBar").querySelectorAll('.mapContext'));
            appBar.removeEventListener("beforehide", appBarBeforeHide);
            
            if (map) {               
                Application.searchManager = null;

                // Save the bound so we can restore them later
                Application.state.mapBounds = map.getBounds();
                // Clean up the map, otherwise we get an exception when navigating back here
                map.dispose();
                map = null;
            }
            // Unregister context sensitive event handlers
            document.removeEventListener("visibilitychange", visibilityChanged);
            Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onresultsuggestionchosen = null;
            Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView().ondatarequested = oldShareHandler;
        }
    });

    // Share Charm handling
    // --------------------

    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
              ? args[number]
              : match
            ;
        });
    };

    function onShareData(e) {
        // If no apotheke is selected ...
        if (!selectedApotheke) {
            // call the handler that recommends the whole app
            if (oldShareHandler) {
                oldShareHandler(e);
            }
            return;
        }
        var request = e.request;
        request.data.properties.title = WinJS.Resources.getString('recommend_title').value;
        request.data.properties.description = WinJS.Resources.getString('recommend_description').value;
        // Get together the text for sharing
        var HTMLtext = WinJS.Resources.getString('recommend_apotheke_html').value;
        // Put together the address
        var HTMLaddress = selectedApotheke.name + "<br>" + selectedApotheke.street + "<br/>" + selectedApotheke.zipcode + " " + selectedApotheke.city + "<br/>Tel: " + selectedApotheke.telephone;
        // Replace the placeholder with the address
        HTMLtext = HTMLtext.format(HTMLaddress);
        // Tell the request
        request.data.setHtmlFormat(Windows.ApplicationModel.DataTransfer.HtmlFormatHelper.createHtmlFormat(HTMLtext));
    };

    function appBarBeforeHide(e) {
        if (locationErrorDiv) {
            locationErrorDiv.style.display = "none";
        }
        
    }

    function visibilityChanged() {
        // Check if we have become visible
        if (document.visibilityState == "visible") {
            checkDataExpired();
        }
    }

    var expiredDialogShowing = false;
    function checkDataExpired() {
        // Check if the data has expired
        if (!expiredDialogShowing &&
            Application.state.timestamp &&
            new Date().getTime() - Application.state.timestamp.getTime() > Application.DATA_EXPIRES_TIMEOUT) {

            var msg = new Windows.UI.Popups.MessageDialog(
                WinJS.Resources.getString('data_expired').value);

            var refreshCommand = new Windows.UI.Popups.UICommand(WinJS.Resources.getString('refresh').value, dataExpiredHandler, 0);
            var cancelCommand = new Windows.UI.Popups.UICommand(WinJS.Resources.getString('cancel').value);

            msg.commands.append(refreshCommand);
            msg.commands.append(cancelCommand);

            msg.defaultCommandIndex = 0;
            msg.cancelCommandIndex = 1;

            // Show the message dialog
            expiredDialogShowing = true;
            msg.showAsync().done(
                function () { expiredDialogShowing = false },
                function () { expiredDialogShowing = false });
        }
    }

    function dataExpiredHandler(event) {
        // Aktualisieren
        if (event.id == 0) {
            updateData(new Microsoft.Maps.Location(Application.state.latitude, Application.state.longitude));
        }
    }

    // Location lookup code
    // --------------------

    var nav = null;
    function requestLocation() {
        if (nav == null) {
            nav = window.navigator;
        }

        //window.console.log("test");
        window.console.log("test");

        var geoloc = nav.geolocation;
        if (geoloc != null) {
            locationErrorDiv.style.display = "none";
            retrievingDataProgress.style.display = "inline";
            cmdUseLocation.winControl.disabled = true;

            geoloc.getCurrentPosition(requestLocationCallback, requestLocationFailed);
        }
    }

    function requestLocationCallback(position) {        
        updateData(position.coords);
    }

    function requestLocationFailed(error) {
        // In any event reanable the appbar button
        cmdUseLocation.winControl.disabled = false;

        var locationErrorHeading = document.getElementById("locationErrorHeading");
        var locationErrorDetails = document.getElementById("locationErrorDetails");

        // The user might have navigated away while the search was in progress. If this is the case
        // do nothing
        if (locationErrorHeading == null || locationErrorDetails == null) {
            return;
        }

        // Check for known errors
        switch (error.code) {
            // In case the location support is turned off tell the user how to turn it on
            case error.PERMISSION_DENIED:
                locationErrorHeading.innerText = WinJS.Resources.getString('error_location_unavailable_title').value;
                locationErrorDetails.innerText = WinJS.Resources.getString('error_location_unavailable_description').value;

                break;
                // In all other cases tell the user to try again later
            case error.POSITION_UNAVAILABLE:
            case error.TIMEOUT:
            default:
                locationErrorHeading.innerText = WinJS.Resources.getString('error_location_error_title').value;
                locationErrorDetails.innerText = WinJS.Resources.getString('error_location_error_description').value;

                break;
        }

        // Bring up the AppBar
        appBar.show();
        retrievingDataProgress.style.display = "none";
        locationErrorDiv.style.display = "inline";
    }

    // Map mangement code
    // ------------------
        
    function updateData(loc) {
        // Show the progress bar
        retrievingDataProgress.style.display = "inline";
        cmdUseLocation.winControl.disabled = true;

        // Note: Both requests are sent off in parallel, so the order in which they complete is 
        // not deterministic. 
        var notdienstRequestFinished = false;
        var regularRequestFinished = false;

        var newstate = {
            mapBounds: null,
            latitude: loc.latitude,
            longitude: loc.longitude,
            timestamp: new Date(),
            regularApotheken: [],
            notdienstApotheken: [],
        }

        Application.WebServiceTools.requestData(false, loc).done(
            function (list) {
                newstate.regularApotheken = list;
                regularRequestFinished = true;
                // Check if both requests have finished
                if (notdienstRequestFinished && regularRequestFinished) {
                    updateDataSuccesful(newstate);
                }
            },
            function (error) {
                regularRequestFinished = true;
                // Check if both requests have finished
                if (notdienstRequestFinished && regularRequestFinished) {
                    searchErrorCallback();
                }
            });

        Application.WebServiceTools.requestData(true, loc).done(
            function (list) {
                newstate.notdienstApotheken = list;
                notdienstRequestFinished = true;
                // Check if both requests have finished
                if (notdienstRequestFinished && regularRequestFinished) {
                    updateDataSuccesful(newstate);
                }
            }, 
            function (error) {
                notdienstRequestFinished = true;
                // Check if both requests have finished
                if (notdienstRequestFinished && regularRequestFinished) {
                    searchErrorCallback();
                }
            });
    }

    // Once both requests have successfuly compelte we set the new state as our 
    // current app state and update the UI
    function updateDataSuccesful(newstate) {
        // We might habe navigted to another page (such as the search results page) before the request finished
        if (!map) {
            return;
        }

        for (var property in newstate) {
            Application.state[property] = newstate[property];
        }
        populateMap();
    }

    function searchErrorCallback() {
        // In any event reenable the app bar button
        cmdUseLocation.winControl.disabled = false;

        var locationErrorHeading = document.getElementById("locationErrorHeading");
        var locationErrorDetails = document.getElementById("locationErrorDetails");

        // The user might have navigated away while the search was in progress. If this is the case
        // do nothing
        if (locationErrorHeading == null || locationErrorDetails == null) {
            return;
        }

        locationErrorHeading.innerText = WinJS.Resources.getString('error_refresh_data_failed_title').value;
        locationErrorDetails.innerText = WinJS.Resources.getString('error_refresh_data_failed_description').value;

        // Bring up the AppBar
        appBar.show();
        retrievingDataProgress.style.display = "none";
        locationErrorDiv.style.display = "inline";
    }
       

    function populateMap() {
        // Setup the UI to reflect the restored state
        if (Application.state.notdienst) {
            cmdNotdienst.winControl.selected = true;
            cmdRegular.winControl.selected = false;
        } else {
            cmdNotdienst.winControl.selected = false;
            cmdRegular.winControl.selected = true;
        }

        // if we don't have a location we haven't received any data yet and nothing to populate
        if (Application.state.latitude == null || Application.state.longitude == null)
            return;

        // Hide the progress indicators
        retrievingDataProgress.style.display = "none";
        cmdUseLocation.winControl.disabled = false;

        // Initiailze this with the latitude and longitude of the location we are using
        var minLatitude = Application.state.latitude;
        var maxLatitude = Application.state.latitude;
        var minLongitude = Application.state.longitude;
        var maxLongitude = Application.state.longitude;

        var list;
        if (Application.state.notdienst) {
            list = Application.state.notdienstApotheken;
        } else {
            list = Application.state.regularApotheken;
        }

        // Clear the map
        map.entities.clear();
        mapPins.length = 0;
        // Clear the selection
        selectedApotheke = null;
        selectedApothekeIndex = -1;
        selctedApothekeInfobox = null;

        list.forEach(function (apotheke, index) {
            createApothekenPushpin(apotheke, index);

            minLatitude = Math.min(minLatitude, apotheke.latitude);
            maxLatitude = Math.max(maxLatitude, apotheke.latitude);
            minLongitude = Math.min(minLongitude, apotheke.longitude);
            maxLongitude = Math.max(maxLongitude, apotheke.longitude);
        });

        if (Application.state.mapBounds == null) {
            // Set the zoom level of the map so all pins are shown
            var options = {
                animate: true,
                bounds : new Microsoft.Maps.LocationRect.fromCorners(new Microsoft.Maps.Location(minLatitude, minLongitude), new Microsoft.Maps.Location(maxLatitude, maxLongitude)),
            };
            
            map.setView(options);
        } else {
            // Restore the zoom level of the map
            var options = {
                animate: false,
                bounds: Application.state.mapBounds,
            };
            map.setView(options);
            // Reset bound because the next time this funciton gets called we won't be
            // restoring state
            Application.state.mapBounds = null;
        }

        var pin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(Application.state.latitude, Application.state.longitude),
            {
                icon: "/images/location_marker.png",
                width: 56,
                height: 42,
                anchor: new Microsoft.Maps.Point(18,18),
            });
        map.entities.push(pin);
        
        var list = new WinJS.Binding.List(list);
        apothekenListView.itemDataSource = list.dataSource;
        if (apothekenListViewDiv.style.opacity == 0) {
            apothekenListViewDiv.style.display = "inline";
            WinJS.UI.Animation.enterContent(apothekenListViewDiv, null);
        }
    }

    function createApothekenPushpin(apotheke, index) {
        var loc = new Microsoft.Maps.Location(apotheke.latitude, apotheke.longitude);

        var pushpinOptions = {
            icon: "/images/apo_marker.png",
            width: 91,
            height: 62,
            anchor: new Microsoft.Maps.Point(20, 54)
        };
        var pin = new Microsoft.Maps.Pushpin(loc, pushpinOptions);
        Microsoft.Maps.Events.addHandler(pin, 'click', mapPinClicked);
        pin.apotheke = apotheke;
        pin.listIndex = index;
        map.entities.push(pin);
        mapPins.push(pin);
    }

    function mapPinClicked(e) {
        if (e.targetType == 'pushpin') {
            // Close the details pane if open
            hideDetailsPane();

            // Extract the PushPin that was clicked from the arguments
            var pushPin = e.target;
            // Extract the apotheke associated with the pushpin
            var apotheke = pushPin.apotheke;
            // Sanity check
            if (!apotheke) return;

            // ListView: Select the item in the list and make sure it is visible
            apothekenListView.selection.set(pushPin.listIndex);
            apothekenListView.ensureVisible(pushPin.listIndex);

            // Map: Replace the pin for an Info Box
            swapPinForInfobox(pushPin, apotheke);

            // State: Note: This must be done after the call to swapPinForInfobox()
            selectedApotheke = apotheke;
            selectedApothekeIndex = pushPin.listIndex;

            // Put together the view options for focusing an zooming in on the Apotheke
            var options = {
                animate: true,
                center: pushPin.getLocation(),
            };
            // Set the new view options
            map.setView(options);
        }
    }

    function swapPinForInfobox(pushPin, apotheke) {
        // Replace the PushPin by an Infobox with the name of the apotheke etc.
        if (selctedApothekeInfobox) {
            // Remove the infobox
            map.entities.remove(selctedApothekeInfobox);
            // Restore the pin for this apotheke
            map.entities.push(mapPins[selectedApothekeIndex]);
        }

        // Remove the existing pushing for the selected apotheke
        map.entities.remove(pushPin);
        // Put together the custom HTML for the infobox
        var infoboxHTML = '<div class="Infobox2"><div class="infobox-body"><div class="infobox-title">' +
                apotheke.name + '<div class="infobox-icon"></div></div></div><div class="infobox-stalk"></div></div>';
        // Options for the new InfoBox
        var infoboxOptions = {
            visible: true,
            showCloseButton: false,

            // This code uses the default InfoBox
            //title: apotheke.name,
            //actions: [{ label: WinJS.Resources.getString('show_apotheke_info').value, eventHandler: showDetailsPane }],

            // This code uses our custom InfoBox
            offset:new Microsoft.Maps.Point(-25,0),
            htmlContent: infoboxHTML,
        }
        // Create and app the InfoBox to the map
        selctedApothekeInfobox = new Microsoft.Maps.Infobox(pushPin.getLocation(), infoboxOptions);
        map.entities.push(selctedApothekeInfobox);
        Microsoft.Maps.Events.addHandler(selctedApothekeInfobox, 'click', toggleDetailsPane);
    }

    // UI Event Management
    // -------------------

    function toggleNotdienst(e) {
        var newMode = (e.target == cmdNotdienst);

        if (newMode != Application.state.notdienst) {
            hideDetailsPane();
            // Set the new state
            Application.state.notdienst = newMode;
            // Repopulate the map
            populateMap();

            if (Application.state.notdienst) {
                cmdNotdienst.winControl.selected = true;
                cmdRegular.winControl.selected = false;
            } else {
                cmdNotdienst.winControl.selected = false;
                cmdRegular.winControl.selected = true;
            }
        }
    }

    function cmdUseLocationClick(mouseEvent) {
        hideDetailsPane();
        requestLocation();
    }

    function zoomInClick(e) {
        var options = {
            zoom: map.getZoom() + 1
        }
        map.setView(options);
    };

    function zoomOutClick(e) {
        var options = {
            zoom: map.getZoom() - 1
        }
        map.setView(options);
    };
    

    function listItemInvoked(e) {
        // Get the PushPin for the selected item
        var pushPin = mapPins[e.detail.itemIndex];
        // Extract the apotheke associated with the pushpin
        var apotheke = pushPin.apotheke;
        // Sanity check
        if (!apotheke) return;

        // Swap it out for an InfoBox
        swapPinForInfobox(pushPin, apotheke);

        // State: Note: This must be done after the call to swapPinForInfobox()
        selectedApotheke = apotheke;
        selectedApothekeIndex = e.detail.itemIndex;
        showDetailsPane();

        // Put together the view options for focusing an zooming in on the Apotheke
        var options = {
            animate: true,
            center: pushPin.getLocation(),
        };
        // Set the new view options
        map.setView(options);
    }    

    // Apotheken details pane
    // ----------------------

    function toggleDetailsPane() {
        if (apothekenDetailsDiv.style.display == "none") {
            showDetailsPane();
        } else {
            hideDetailsPane();
            
        }
    }


    function showDetailsPane() {
        var detailName = document.getElementById("detailName");
        var detailStreet = document.getElementById("detailStreet");
        var detailCity = document.getElementById("detailCity");
        var detailDistance = document.getElementById("detailDistance");
        var detailTelephone = document.getElementById("detailTelephone");
        var detailNotdienstStartDay = document.getElementById("detailNotdienstStartDay");
        var detailNotdienstStartTime = document.getElementById("detailNotdienstStartTime");
        var detailNotdienstEndDay = document.getElementById("detailNotdienstEndDay");
        var detailNotdienstEndTime = document.getElementById("detailNotdienstEndTime");
        var notdienstSection = document.querySelector(".notdienst");

        detailName.innerText = selectedApotheke.name;
        detailStreet.innerText = selectedApotheke.street;
        detailCity.innerText = selectedApotheke.zipcode + " " + selectedApotheke.city;
        detailDistance.innerText = selectedApotheke.distance;
        detailTelephone.innerText = selectedApotheke.telephone;

        if (selectedApotheke.notdienst) {
            detailNotdienstStartDay.innerText = selectedApotheke.startdate
            detailNotdienstStartTime.innerText = selectedApotheke.starttime;
            detailNotdienstEndDay.innerText = selectedApotheke.enddate;
            detailNotdienstEndTime.innerText = selectedApotheke.endtime;
            notdienstSection.style.display = "";
        } else {
            notdienstSection.style.display = "none";
        }
        
        var roamingSettings = Windows.Storage.ApplicationData.current.roamingSettings;

        var addressBook = [];
        if (roamingSettings.values["addressBook"]) {
            addressBook = JSON.parse(roamingSettings.values["addressBook"]);
        }

        var contactExists = false;
        addressBook.forEach(function (apotheke) {
            if (Apotheke.equals(selectedApotheke, apotheke)) {
                contactExists = true;
            }
        });

        if (contactExists) {
            addContactButton.disabled = "disabled";
        } else {
            // Reenable the button if it was disabled before
            addContactButton.disabled = "";
        }

        // Animate the content in
        apothekenDetailsDiv.style.display = "";
        WinJS.UI.Animation.enterContent(apothekenDetailsDiv, null)
    }

    function hideDetailsPane() {
        WinJS.UI.Animation.exitContent(apothekenDetailsDiv, null).done(function () {
            apothekenDetailsDiv.style.display = "none";
        });
    }
    

    function addContactClick() {
        var roamingSettings = Windows.Storage.ApplicationData.current.roamingSettings;

        var addressBook = [];
        if (roamingSettings.values["addressBook"]) {
            addressBook = JSON.parse(roamingSettings.values["addressBook"]);
        }

        // The the button
        addContactButton.disabled = "disabled";
        
        // Add the address
        addressBook.push(selectedApotheke);

        //Note: roamingSettings can only hold 8k of data per key. If we exceed this quota
        // we throw away the oldes entries until there is enough space available
        for (var i = 0; i < 5; i++) {
            try {
                // Save the new address book
                roamingSettings.values["addressBook"] = JSON.stringify(addressBook);
                break;
            } catch (e) {
                addressBook.shift();
            }
        }
    }

    function drivingDirectionsClick() {
        var msg = new Windows.UI.Popups.MessageDialog(
                WinJS.Resources.getString('leave_app').value);

        var refreshCommand = new Windows.UI.Popups.UICommand(WinJS.Resources.getString('ok').value, drivingDirecionsHandler, 0);
        var cancelCommand = new Windows.UI.Popups.UICommand(WinJS.Resources.getString('cancel').value);

        msg.commands.append(refreshCommand);
        msg.commands.append(cancelCommand);

        msg.defaultCommandIndex = 0;
        msg.cancelCommandIndex = 1;

        // Show the message dialog
        msg.showAsync();
    }

    function drivingDirecionsHandler() {
        var apotheke = selectedApotheke;
        // Put together the maps url
        var uriToLaunch = 'http://www.bing.com/maps/default.aspx?rtp=~adr.' + apotheke.street + ",  " + apotheke.zipcode + " " + apotheke.city;
        // Create a Uri object from a URI string 
        var uri = new Windows.Foundation.Uri(uriToLaunch);
        // Launch the URI
        Windows.System.Launcher.launchUriAsync(uri);
    }

    // Misc.
    // -----

    function searchSuggestionChosen(eventObject) {
        // Extract the corrdinates form the tag
        var splitTag = eventObject.tag.split(",");
        var location = new Microsoft.Maps.Location(splitTag[0], splitTag[1]);
        // Update the data and map
        updateData(location);
    };
})();
