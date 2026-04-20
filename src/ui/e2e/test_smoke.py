from selenium.webdriver.common.by import By


def test_app_title(driver):
    title = driver.title
    assert title, f"empty title: {title!r}"
    assert "tauri" in title.lower() or "pccx" in title.lower()


def test_root_mounted(driver):
    root = driver.find_element(By.CSS_SELECTOR, "#root")
    assert root is not None


def test_menu_bar_visible(driver):
    menu_file = driver.find_element(By.XPATH, "//button[normalize-space()='File']")
    assert menu_file.is_displayed()
