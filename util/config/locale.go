// Copyright 2023 Shift Crypto AG
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package config

import (
	"strings"
)

// MainLocaleFromNative takes as input the nativeLocale as given by
// backend.Environment().NativeLocale() and returns the language as
// in ISO 639-1.
func MainLocaleFromNative(nativeLocale string) string {
	nativeLocale = strings.Replace(nativeLocale, "_", "-", -1)
	return strings.Split(nativeLocale, "-")[0]
}
