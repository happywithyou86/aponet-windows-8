

(function () {
    "use strict";

    WinJS.Binding.optimizeBindingReferences = true;


    // constants
    var mapPageURI = "/mapPage.html";
    var searchPageURI = "/searchResults.html";

    var app = WinJS.Application;
    var activation = Windows.ApplicationModel.Activation;
    var nav = WinJS.Navigation;
    var contactPickerUI;
    var appBar;

    app.addEventListener("activated", function (eventObject) {

        switch (eventObject.detail.kind) {
            // Launched from the start screen
            case activation.ActivationKind.launch: {
                if (eventObject.detail.previousExecutionState === activation.ApplicationExecutionState.terminated) {
                    // This application has been reactivated from suspension -> Restore application state.

                    // Restore the saved state before we initialize the map so it gets populated with the right data
                    Application.restoreState();
                } else {
                    // This application has been newly launche -> Initialize application state.
                }
                
                eventObject.setPromise(WinJS.UI.processAll().then(function () {
                    return nav.navigate(Application.navigator.home);
                }));
            } break;
            // Launched for search
            case Windows.ApplicationModel.Activation.ActivationKind.search: {
                eventObject.setPromise(WinJS.UI.processAll().then(function () {                    

                    // If we got a non-empty query text
                    if (eventObject.detail.queryText !== "") {
                        // If we are not already showing search results ...
                        if (nav.location !== searchPageURI) {
                            // Make sure the page above the search result page on the navigation stack is a map page
                            nav.history.current = { location: mapPageURI, initialState: {} };
                            // Navigate to the seach result page
                            return nav.navigate(searchPageURI, { queryText: eventObject.detail.queryText });
                        }
                    }
                }));
            } break;
            // Launched as a contact picker
            case Windows.ApplicationModel.Activation.ActivationKind.contactPicker: {
                // Use setPromise to indicate to the system that the splash screen must not be torn down
                // until after processAll and navigate complete asynchronously.
                var contactPickerUI = eventObject.detail.contactPickerUI;
                eventObject.setPromise(WinJS.UI.processAll().then(function () {
                    // Navigate to the contact picker
                    return nav.navigate(contactPickerURI, {contactPickerUI: contactPickerUI});
                }));
            } break;
        }
        // Process all data-win-res attributes
        WinJS.Resources.processAll();

        appBar = document.getElementById("appBar").winControl;        
        var recommendButton = document.getElementById("recommendButton");
        recommendButton.addEventListener("click", recommend, false);
    });

    app.oncheckpoint = function (args) {
        // TODO: This application is about to be suspended. Save any state
        // that needs to persist across suspensions here. If you need to 
        // complete an asynchronous operation before your application is 
        // suspended, call args.setPromise().
        app.sessionState.history = nav.history;

        // Save the application state
        Application.saveState();
    };

    // Recommend handling
    // ------------------   

    function recommend() {
        document.getElementById("recommendFlyout").winControl.hide();
        appBar.hide();
        Windows.ApplicationModel.DataTransfer.DataTransferManager.showShareUI();
    }    

    // Search suggestion handling
    // ----------------------

    function geocodeSuccessCallback(geocodeResult, userData) {
        geocodeResult.results.forEach(function (res) {
            var imageURI = Windows.Foundation.Uri("ms-appx:///images/icon_orten.png");
            var imageRef = Windows.Storage.Streams.RandomAccessStreamReference.createFromUri(imageURI);

            var tag = "" + res.location.latitude + "," + res.location.longitude;
            userData.suggestionRequest.searchSuggestionCollection.appendResultSuggestion(res.name, "", tag, imageRef, "Alt text");
        });

        userData.deferral.complete();
    }

    function geocodeErrorCallback(args) {
        // Fail quietly. We display an error on the search page
        args.request.userData.deferral.complete();
    }

    // Register the onsuggestionsrequested event in your apps global scope, for example default.js, so that it is registered as soon as your app is launched.
    Windows.ApplicationModel.Search.SearchPane.getForCurrentView().onsuggestionsrequested = function (eventObject) {
        // If we don't currently have a map we don't currently have a search manager (should never happen)
        if (!Application.searchManager) {
            return;
        }

        var queryText = eventObject.queryText;
        var suggestionRequest = eventObject.request;
        var deferral = suggestionRequest.getDeferral();

        var geocodeRequest = {
            // Make sure it does not say "Deutschland" twice in the search term
            where: queryText.replace("Deutschland", "") + " Deutschland",
            count: 5,
            callback: geocodeSuccessCallback,
            errorCallback: geocodeErrorCallback,
            userData: { suggestionRequest: suggestionRequest, deferral: deferral },
        };
        Application.searchManager.geocode(geocodeRequest);
    };

    Windows.ApplicationModel.Search.SearchPane.getForCurrentView().placeholderText = WinJS.Resources.getString('find_address').value;    

    // Share Charm handling
    // --------------------
    
    function onShareData(e) {
        var request = e.request;
        request.data.properties.title = WinJS.Resources.getString('recommend_title').value;
        request.data.properties.description = WinJS.Resources.getString('recommend_description').value;
        var HTMLtext = WinJS.Resources.getString('recommend_html').value;
        request.data.setHtmlFormat(Windows.ApplicationModel.DataTransfer.HtmlFormatHelper.createHtmlFormat(HTMLtext));
    };

    Windows.ApplicationModel.DataTransfer.DataTransferManager.getForCurrentView().ondatarequested = onShareData;

    // Settings handling
    // ------------------

    // Setup the Impressum page in the app settings
    WinJS.Application.onsettings = function (e) {
        e.detail.applicationcommands =
            {
                "impressum": { title: "Impressum", href: mapPageURI },
            };
        WinJS.UI.SettingsFlyout.populateSettings(e);
    };


    // Setup the Datenschutz link in the app settings
    Windows.UI.ApplicationSettings.SettingsPane.getForCurrentView().oncommandsrequested = function (eventArgs) {
        eventArgs.request.applicationCommands.append(
            new Windows.UI.ApplicationSettings.SettingsCommand("datenschutz", "Datenschutz", onDatenschutzSettingsCommand)
        );
    }

    function onDatenschutzSettingsCommand(settingsCommand) {
        Windows.System.Launcher.launchUriAsync(new Windows.Foundation.Uri('http://apotheken.apertomove.de/'));
    }

    app.start();
})();
