-- Create database
CREATE DATABASE IF NOT EXISTS jewelry_workshop;
USE jewelry_workshop;

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'framing', 'setting', 'polish', 'repair', 'dispatch') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Work orders table
CREATE TABLE work_orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_number VARCHAR(50) UNIQUE NOT NULL,
    party_name VARCHAR(255) NOT NULL,
    po_number VARCHAR(100),
    po_date DATE,
    item_details TEXT NOT NULL,
    model_number VARCHAR(100),
    description_of_work TEXT,
    status ENUM('pending', 'in-progress', 'completed', 'dispatched', 'cancelled') DEFAULT 'pending',
    gross_weight DECIMAL(10,3),
    net_weight DECIMAL(10,3),
    expected_completion_date DATE,
    completed_date DATE,
    dispatched_by VARCHAR(255),
    dispatched_date DATE,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Work order stages table
CREATE TABLE work_order_stages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    stage_name ENUM('framing', 'setting', 'polish', 'repair', 'dispatch') NOT NULL,
    karigar_name VARCHAR(255),
    issue_date DATE,
    issue_weight DECIMAL(10,3),
    jamah_date DATE,
    jamah_weight DECIMAL(10,3),
    sorting_issue INT,
    sorting_jamah INT,
    weight_difference DECIMAL(10,3),
    status ENUM('not-started', 'in-progress', 'completed', 'on-hold') DEFAULT 'not-started',
    approved BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- Stones table (received stones)
CREATE TABLE stones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    type VARCHAR(100) NOT NULL,
    pieces INT NOT NULL,
    weight_grams DECIMAL(10,3) NOT NULL,
    weight_carats DECIMAL(10,3) NOT NULL,
    is_received BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- Returned stones table
CREATE TABLE returned_stones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    type VARCHAR(100) NOT NULL,
    pieces INT NOT NULL,
    weight_grams DECIMAL(10,3) NOT NULL,
    weight_carats DECIMAL(10,3) NOT NULL,
    returned_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- Worker assignments table
CREATE TABLE worker_assignments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    user_id INT NOT NULL,
    stage_type ENUM('framing', 'setting', 'polish', 'repair', 'dispatch') NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE KEY unique_assignment (work_order_id, stage_type)
);

-- Activity logs table
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    work_order_id INT NOT NULL,
    work_order_number VARCHAR(50) NOT NULL,
    action VARCHAR(255) NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_by_role VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
);

-- Insert default users
INSERT INTO users (email, password, name, role) VALUES
('admin@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Admin User', 'admin'),
('manager@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Manager User', 'manager'),
('framing@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'John Doe', 'framing'),
('setting@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Jane Smith', 'setting'),
('polish@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Mike Johnson', 'polish'),
('repair@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Sarah Wilson', 'repair'),
('dispatch@shop.com', '$2b$10$rOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQZQZQZQZOzJqQZQZQZQZQ', 'Tom Brown', 'dispatch');
