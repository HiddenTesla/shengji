package shengji.gui;

import org.apache.log4j.Logger;
import shengji.common.FrameCreator;
import shengji.exception.ImageNotFoundException;
import shengji.logger.LogFactory;

import javax.swing.*;
import java.awt.event.MouseEvent;
import java.awt.event.MouseListener;
import java.io.File;

public class ImageLabel extends JLabel {
    protected static final String PROJECT_PATH = System.getProperty("user.dir") + "/";
    public static final String IMAGE_DIRECTORY = PROJECT_PATH + "src/main/resources/images/";

    private static Logger log = LogFactory.getLog(ImageLabel.class);

    protected JFrame mFrame;
    protected ImageIcon mIcon;

    public ImageLabel(JFrame frame) {
        if (frame == null) {
            throw new NullPointerException();
        }
        this.mFrame = frame;
        this.setMouseEventListener();
        frame.add(this);
    }

    public ImageLabel(JFrame frame, String filePath) {
        this(frame);
        setImageDirectory(filePath);
    }

    public void setImageDirectory(String file) {

        // Seems that slash (/) and backslash (\) can be used interchangeably
        String imagePath = IMAGE_DIRECTORY + file;
        imagePath = imagePath.replace('\\', '/');
        if (!ValidFileExistense(imagePath)) {
            String errorMsg = "Cant find file '" + imagePath + "' Please check";
            log.error(errorMsg);
            throw new ImageNotFoundException(errorMsg);
        }

        mIcon = new ImageIcon(IMAGE_DIRECTORY + file);
        this.setIcon(mIcon);
    }

    @Override
    public void setLocation(int x, int y) {
        super.setBounds(x, y, mIcon.getIconWidth(), mIcon.getIconHeight());
    }

    public void setMouseEventListener() {
        this.addMouseListener(new MouseListener() {
            public void mouseClicked(MouseEvent e) {
                log.info("Mouse clicked on an ImageLabel");
            }

            public void mousePressed(MouseEvent e) {}
            public void mouseReleased(MouseEvent e) {}
            public void mouseEntered(MouseEvent e) {}
            public void mouseExited(MouseEvent e) {}
        });
    }

    public static void main(String[] args) {
        JFrame frame = FrameCreator.createFrame();

        ImageLabel img = new ImageLabel(frame);
        img.setImageDirectory(      "sample_01.jpg");
        img.setLocation(60, 70);
        frame.setVisible(true);
    }

    private static boolean ValidFileExistense(String fullPath) {
        File file = new File(fullPath);
        return file.exists();
    }
}
